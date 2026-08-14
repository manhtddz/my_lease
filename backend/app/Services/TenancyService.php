<?php

namespace App\Services;

use App\Enums\Code;
use App\Models\Contract;
use App\Models\ContractOccupant;
use App\Models\ContractService;
use App\Models\Invoice;
use App\Models\InvoiceDetail;
use App\Models\Meter;
use App\Models\MeterReading;
use App\Models\Payment;
use App\Models\Room;
use App\Models\ServiceItem;
use App\Models\Setting;
use App\Models\Tenant;
use App\Support\AuditLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Wizard nhận khách và trả phòng — hai sự kiện sinh meter_readings
 * với reason 2 (khách vào) và 3 (khách ra).
 *
 * Mỗi wizard là MỘT transaction: hoặc đủ cả cụm bản ghi, hoặc không gì cả.
 */
class TenancyService
{
    public function __construct(
        private MeterReadingService $readings,
        private BillingService $billing,
    ) {}

    /**
     * Nhận khách mới.
     *
     * Sinh: tenants + contracts + contract_occupants + contract_services
     *     + 2 meter_readings (reason 2) + payments (thu cọc) + rooms.status = 2
     */
    public function moveIn(array $data): Contract
    {
        return DB::transaction(function () use ($data) {
            $room = Room::findOrFail($data['room_id']);

            if ($room->status === Code::ROOM_OCCUPIED) {
                throw new RuntimeException("Phòng {$room->code} đang có người thuê.");
            }

            $tenant = isset($data['tenant_id'])
                ? Tenant::findOrFail($data['tenant_id'])
                : Tenant::create($data['tenant']);

            $startDate = $data['start_date'];

            $contract = Contract::create([
                'code' => $this->contractCode($startDate),
                'room_id' => $room->id,
                'tenant_id' => $tenant->id,
                'start_date' => $startDate,
                'end_date' => $data['end_date'] ?? null,
                'rent_amount' => (int) $data['rent_amount'],
                'deposit_amount' => (int) ($data['deposit_amount'] ?? 0),
                'occupant_count' => max(1, (int) ($data['occupant_count'] ?? 1)),
                'status' => Code::CONTRACT_ACTIVE,
                'note' => $data['note'] ?? null,
            ]);

            foreach ($data['occupants'] ?? [] as $occupant) {
                ContractOccupant::create([
                    'contract_id' => $contract->id,
                    'full_name' => $occupant['full_name'],
                    'id_card_no' => $occupant['id_card_no'] ?? null,
                    'dob' => $occupant['dob'] ?? null,
                    'phone' => $occupant['phone'] ?? null,
                    'relationship' => $occupant['relationship'] ?? null,
                    'moved_in_at' => $startDate,
                    'is_registered' => false,
                ]);
            }

            // Bảng giá dịch vụ — chỉ nhận item có is_service = 1.
            // Tiền phòng nằm ở contracts.rent_amount, không lọt vào đây.
            foreach ($data['services'] ?? [] as $service) {
                $item = ServiceItem::findOrFail($service['service_item_id']);
                if (! $item->is_service) {
                    continue;
                }

                ContractService::create([
                    'contract_id' => $contract->id,
                    'service_item_id' => $item->id,
                    'unit_price' => (int) $service['unit_price'],
                    'quantity_fixed' => $service['quantity_fixed'] ?? null,
                    'is_active' => true,
                ]);
            }

            // Chốt số đồng hồ tại ngày vào — bắt buộc, là điểm khởi đầu chuỗi của khách này.
            // Đoạn tiêu thụ TRƯỚC mốc này thuộc khoảng phòng trống -> contract_id NULL -> chi phí chủ.
            foreach ($data['meter_readings'] ?? [] as $entry) {
                $this->readings->record(
                    meterId: (int) $entry['meter_id'],
                    reading: (float) $entry['reading'],
                    readDate: $startDate,
                    reason: Code::READ_MOVE_IN,
                    periodYm: Carbon::parse($startDate)->format('Ym'),
                    contractId: null,          // đoạn trước khi khách vào = phòng trống
                    contractIdGiven: true,
                );
            }

            if ($contract->deposit_amount > 0 && ($data['deposit_received'] ?? true)) {
                Payment::create([
                    'contract_id' => $contract->id,
                    'invoice_id' => null,
                    'kind' => Code::PAY_DEPOSIT_IN,
                    'amount' => $contract->deposit_amount,
                    'paid_at' => $startDate,
                    'method' => $data['deposit_method'] ?? Code::METHOD_CASH,
                    'note' => 'Thu tiền cọc',
                ]);
            }

            $room->update(['status' => Code::ROOM_OCCUPIED]);

            AuditLog::info(AuditLog::TENANCY, sprintf(
                'Nhận khách %s vào phòng %s từ %s · thuê %s · cọc %s',
                $tenant->full_name,
                $room->code,
                $startDate,
                number_format($contract->rent_amount, 0, ',', '.'),
                number_format($contract->deposit_amount, 0, ',', '.')
            ), [
                'contract_id' => $contract->id,
                'contract_code' => $contract->code,
                'tenant_id' => $tenant->id,
                'occupant_count' => $contract->occupant_count,
                'services' => $contract->services->count(),
            ]);

            return $contract->load(['tenant', 'room', 'services.serviceItem', 'occupants']);
        });
    }

    /**
     * Xem trước tất toán trả phòng. Không ghi DB.
     */
    public function moveOutPreview(Contract $contract, string $endDate): array
    {
        $periodYm = Carbon::parse($endDate)->format('Ym');
        $periodFrom = $this->readings->firstDayOf($periodYm);
        $from = max($periodFrom, $contract->start_date->toDateString());

        // Kỳ đã chốt sổ một phần thì tất toán chỉ tính từ ngày sau đó — hiển thị
        // đúng khoảng mà hoá đơn tất toán sẽ tính, xem BillingService::segment().
        $lastBilled = $this->billing->lastBilledDay($contract->id);
        if ($lastBilled !== null) {
            $from = max($from, Carbon::parse($lastBilled)->addDay()->toDateString());
        }

        $meters = Meter::where('room_id', $contract->room_id)->where('is_active', true)->orderBy('type')->get();
        $meterRows = [];

        foreach ($meters as $meter) {
            // Mốc cũ phải là lần đọc TRƯỚC ngày trả, không phải mắt xích cuối chuỗi.
            $last = $this->readings->lastReadingBefore($meter->id, $endDate);
            $meterRows[] = [
                'meter_id' => $meter->id,
                'type' => $meter->type,
                'prev_reading' => $last?->reading ?? (float) $meter->initial_reading,
                'prev_read_date' => $last?->read_date?->toDateString() ?? $meter->installed_at->toDateString(),
            ];
        }

        // Ngày trả nằm trong đoạn đã ra hoá đơn → không còn gì để tất toán.
        // Xảy ra khi chọn ngày trả sớm hơn ngày đã chốt sổ.
        $billable = $from <= $endDate;

        return [
            'contract_id' => $contract->id,
            'room_code' => $contract->room->code,
            'tenant_name' => $contract->tenant?->full_name,
            'start_date' => $contract->start_date->toDateString(),
            'period_from' => $from,
            'period_to' => $endDate,
            'days' => $billable ? Carbon::parse($from)->diffInDays(Carbon::parse($endDate)) + 1 : 0,
            'billable' => $billable,
            'billed_to' => $lastBilled,
            'rent_amount' => $contract->rent_amount,
            'deposit_held' => $contract->depositHeld(),
            'carried_over' => $this->billing->carriedOver($contract->id, $periodYm),
            'meters' => $meterRows,
        ];
    }

    /**
     * Huỷ hợp đồng CHƯA tới ngày vào — khách đặt trước rồi đổi ý.
     *
     * Khác trả phòng ở chỗ không có ngày nào đã ở: không sinh hoá đơn, không chốt
     * số đồng hồ. Chỉ gỡ mốc đồng hồ đã ghi lúc nhận khách, hoàn cọc (trừ phạt
     * nếu có) và trả phòng về trạng thái trống.
     *
     * Gỡ mốc đồng hồ là bắt buộc: mốc đó nằm ở ngày vào — tức tương lai — nên nếu
     * để lại thì không ghi số cho phòng này được nữa (chèn giữa chuỗi).
     */
    public function cancel(Contract $contract, array $data = []): Contract
    {
        if ($contract->status !== Code::CONTRACT_ACTIVE) {
            throw new RuntimeException('Hợp đồng không còn hiệu lực.');
        }

        if ($contract->start_date->toDateString() <= Carbon::today()->toDateString()) {
            throw new RuntimeException(sprintf(
                'Hợp đồng đã bắt đầu từ %s — dùng Trả phòng để tất toán, không huỷ được nữa.',
                $contract->start_date->format('d/m/Y')
            ));
        }

        if ($contract->invoices()->exists()) {
            throw new RuntimeException(
                'Hợp đồng đã có hoá đơn nên không huỷ được. Huỷ hoá đơn đó trước.'
            );
        }

        return DB::transaction(function () use ($contract, $data) {
            // 1. Gỡ mốc đồng hồ ghi lúc nhận khách. Chỉ gỡ mốc CHƯA tính tiền và
            //    đúng ngày vào — không đụng chuỗi đọc của khách trước.
            $meterIds = Meter::where('room_id', $contract->room_id)->pluck('id');

            MeterReading::whereIn('meter_id', $meterIds)
                ->where('read_date', $contract->start_date->toDateString())
                ->where('reason', Code::READ_MOVE_IN)
                ->where('is_billed', false)
                ->get()
                ->each
                ->delete();

            // 2. Cọc: trừ phạt (nếu có) rồi hoàn phần còn lại. Cùng cách ghi nhận
            //    như trả phòng để lịch sử thu chi đọc nhất quán.
            $held = $contract->depositHeld();
            $deduct = min($held, (int) ($data['deposit_deduction'] ?? 0));
            $refund = $held - $deduct;

            if ($deduct > 0) {
                Payment::create([
                    'contract_id' => $contract->id,
                    'invoice_id' => null,
                    'kind' => Code::PAY_DEPOSIT_REFUND,
                    'amount' => -$deduct,
                    'paid_at' => Carbon::today()->toDateString(),
                    'method' => Code::METHOD_OTHER,
                    'note' => 'Phạt huỷ hợp đồng: '.($data['deduction_reason'] ?? 'không ghi lý do'),
                ]);
            }

            if ($refund > 0 && ($data['refund_deposit'] ?? true)) {
                Payment::create([
                    'contract_id' => $contract->id,
                    'invoice_id' => null,
                    'kind' => Code::PAY_DEPOSIT_REFUND,
                    'amount' => -$refund,
                    'paid_at' => Carbon::today()->toDateString(),
                    'method' => $data['refund_method'] ?? Code::METHOD_CASH,
                    'note' => 'Hoàn cọc do huỷ hợp đồng',
                ]);
            }

            $contract->update([
                'status' => Code::CONTRACT_CANCELLED,
                'note' => trim(($contract->note ?? '')."\nHuỷ: ".($data['reason'] ?? 'không ghi lý do')),
            ]);

            $contract->room->update(['status' => Code::ROOM_VACANT]);

            AuditLog::warning(AuditLog::TENANCY, sprintf(
                'Huỷ hợp đồng %s · phòng %s · %s · chưa tới ngày vào %s · hoàn cọc %s%s',
                $contract->code,
                $contract->room->code,
                $contract->tenant?->full_name,
                $contract->start_date->toDateString(),
                number_format($refund, 0, ',', '.'),
                $deduct > 0 ? ' · phạt '.number_format($deduct, 0, ',', '.') : ''
            ), [
                'contract_id' => $contract->id,
                'deposit_deduction' => $deduct,
                'deposit_refund' => $refund,
                'reason' => $data['reason'] ?? null,
            ]);

            return $contract->refresh()->load(['tenant', 'room']);
        });
    }

    /**
     * Tất toán trả phòng.
     *
     * Sinh: 2 meter_readings (reason 3) + invoice is_settlement + details
     *     + contracts.status=3 + rooms.status=1 + payments hoàn cọc
     */
    public function moveOut(Contract $contract, array $data): Invoice
    {
        if ($contract->status !== Code::CONTRACT_ACTIVE) {
            throw new RuntimeException('Hợp đồng không còn hiệu lực.');
        }

        // Chưa tới ngày vào thì chưa có gì để tất toán. Muốn bỏ hợp đồng này thì
        // là huỷ hợp đồng, không phải trả phòng — hai việc khác nhau.
        if ($contract->start_date->toDateString() > Carbon::today()->toDateString()) {
            throw new RuntimeException(sprintf(
                'Hợp đồng chưa bắt đầu (ngày vào %s). Chưa ở ngày nào thì chưa trả phòng được.',
                $contract->start_date->format('d/m/Y')
            ));
        }

        return DB::transaction(function () use ($contract, $data) {
            $endDate = $data['end_date'];
            $periodYm = Carbon::parse($endDate)->format('Ym');

            // 1. Chốt số đồng hồ tại ngày trả — đoạn này thuộc về khách đang ở.
            //
            //    Hoá đơn của kỳ này (nếu đã chốt sổ) chỉ phủ tới ngày ghi số gần
            //    nhất, không phủ tới cuối tháng, nên KHÔNG cần huỷ nó: hoá đơn tất
            //    toán bên dưới chỉ tính tiếp đoạn còn lại. Xem BillingService::segment().
            foreach ($data['meter_readings'] ?? [] as $entry) {
                // Chuỗi chỉ số đã có mốc phủ tới ngày trả thì bỏ qua — ghi thêm chỉ
                // để đụng khoá "đã tính tiền" / "chèn giữa chuỗi" mà không thêm gì:
                //   - cùng ngày và đã chốt sổ → mốc đó chính là mốc trả phòng;
                //   - có lần đọc sau ngày trả → khách đã trả tiền quá ngày đi.
                $covered = MeterReading::where('meter_id', (int) $entry['meter_id'])
                    ->where(fn ($q) => $q
                        ->where(fn ($w) => $w->where('read_date', $endDate)->where('is_billed', true))
                        ->orWhere('read_date', '>', $endDate))
                    ->exists();

                if ($covered) {
                    continue;
                }

                $this->readings->record(
                    meterId: (int) $entry['meter_id'],
                    reading: (float) $entry['reading'],
                    readDate: $endDate,
                    reason: Code::READ_MOVE_OUT,
                    periodYm: $periodYm,
                    contractId: $contract->id,
                    contractIdGiven: true,
                );
            }

            // 2. Kết thúc hợp đồng TRƯỚC khi dựng hoá đơn để biên kỳ tính đúng tới ngày trả.
            $contract->update([
                'actual_end_date' => $endDate,
                'status' => Code::CONTRACT_ENDED,
            ]);

            // 3. Hoá đơn tất toán — dùng chung cỗ máy chốt sổ, chỉ khác cờ is_settlement.
            //    Chỉ gồm đoạn chưa ra hoá đơn: đã chốt sổ tới ngày 14 rồi thì hoá
            //    đơn này tính từ ngày 15 tới ngày trả phòng.
            $preview = $this->billing->preview($periodYm);
            $draft = collect($preview['invoices'])->firstWhere('contract_id', $contract->id);

            // Không còn ngày nào phải tính — khách đã trả tiền tới hết ngày đi.
            // Vẫn tất toán bình thường: hoá đơn bằng 0 để có chứng từ trả phòng và
            // để phần xử lý cọc bên dưới có chỗ bám vào.
            $subtotal = $draft['subtotal'] ?? 0;
            $carriedOver = $draft['carried_over'] ?? $this->billing->carriedOver($contract->id, $periodYm);
            $periodFrom = $draft['period_from'] ?? $endDate;
            $periodTo = $draft['period_to'] ?? $endDate;

            $discount = (int) ($data['discount'] ?? 0);
            $total = $subtotal - $discount + $carriedOver;

            $invoice = Invoice::create([
                'code' => $this->billing->uniqueInvoiceCode("STL-{$periodYm}-{$contract->room->code}"),
                'contract_id' => $contract->id,
                'room_id' => $contract->room_id,
                'period_ym' => $periodYm,
                'period_from' => $periodFrom,
                'period_to' => $periodTo,
                'issue_date' => Carbon::today()->toDateString(),
                'due_date' => $endDate,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'carried_over' => $carriedOver,
                'total' => $total,
                'paid_amount' => 0,
                'is_settlement' => true,
                // Hoá đơn 0đ coi như xong luôn, không bắt người dùng đi "thu 0đ".
                'status' => $total > 0 ? Code::INVOICE_ISSUED : Code::INVOICE_PAID,
                'note' => $data['note'] ?? null,
            ]);

            foreach ($draft['details'] ?? [] as $i => $line) {
                InvoiceDetail::create([
                    'invoice_id' => $invoice->id,
                    'service_item_id' => $line['service_item_id'],
                    'description' => $line['description'],
                    'meter_reading_id' => $line['meter_reading_id'] ?? null,
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'amount' => $line['amount'],
                    'sort_order' => $i,
                ]);
            }

            if ($draft['reading_ids'] ?? []) {
                MeterReading::whereIn('id', $draft['reading_ids'])->update(['is_billed' => true]);
            }

            // 4. Xử lý cọc: trừ hỏng hóc rồi hoàn phần còn lại. (giữ nguyên như cũ)
            $held = $contract->depositHeld();
            $deduct = min($held, (int) ($data['deposit_deduction'] ?? 0));
            $refund = $held - $deduct;

            if ($deduct > 0) {
                Payment::create([
                    'contract_id' => $contract->id,
                    'invoice_id' => $invoice->id,
                    'kind' => Code::PAY_DEPOSIT_REFUND,
                    'amount' => -$deduct,
                    'paid_at' => $endDate,
                    'method' => Code::METHOD_OTHER,
                    'note' => 'Trừ cọc: '.($data['deduction_reason'] ?? 'hỏng hóc'),
                ]);
            }

            if ($refund > 0 && ($data['refund_deposit'] ?? true)) {
                Payment::create([
                    'contract_id' => $contract->id,
                    'invoice_id' => null,
                    'kind' => Code::PAY_DEPOSIT_REFUND,
                    'amount' => -$refund,
                    'paid_at' => $endDate,
                    'method' => $data['refund_method'] ?? Code::METHOD_CASH,
                    'note' => 'Hoàn tiền cọc',
                ]);
            }

            // 5. Trả phòng về trạng thái trống — sẵn sàng cho khách mới ngay trong tháng.
            $contract->room->update(['status' => Code::ROOM_VACANT]);

            AuditLog::warning(AuditLog::TENANCY, sprintf(
                'Trả phòng %s · %s · ngày %s · hoá đơn tất toán %s (%s)',
                $contract->room->code,
                $contract->tenant?->full_name,
                $endDate,
                $invoice->code,
                number_format($invoice->total, 0, ',', '.')
            ), [
                'contract_id' => $contract->id,
                'invoice_id' => $invoice->id,
                'deposit_held' => $held,
                'deposit_deducted' => $deduct,
                'deduction_reason' => $data['deduction_reason'] ?? null,
                'deposit_refunded' => ($data['refund_deposit'] ?? true) ? $refund : 0,
            ]);

            return $invoice->load('details');
        });
    }

    private function contractCode(string $startDate): string
    {
        $year = Carbon::parse($startDate)->format('Y');
        $seq = Contract::whereYear('start_date', $year)->count() + 1;

        return sprintf('HD-%s-%03d', $year, $seq);
    }

    /** Gợi ý bảng giá khi tạo hợp đồng: lấy default_price của các khoản dịch vụ. */
    public function serviceDefaults(): array
    {
        return ServiceItem::where('is_active', true)
            ->where('is_service', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (ServiceItem $i) => [
                'service_item_id' => $i->id,
                'code' => $i->code,
                'name' => $i->name,
                'pricing_mode' => $i->pricing_mode,
                'unit_label' => $i->unit_label,
                'unit_price' => $i->default_price,
                'suggested' => in_array($i->code, ['electric', 'water', 'garbage'], true),
            ])
            ->all();
    }

    public function dueDays(): int
    {
        return (int) Setting::get('due_days', 5);
    }
}
