<?php

namespace App\Services;

use App\Enums\Code;
use App\Models\Contract;
use App\Models\ContractOccupant;
use App\Models\ContractService;
use App\Models\Invoice;
use App\Models\InvoiceDetail;
use App\Models\Meter;
use App\Models\Payment;
use App\Models\Room;
use App\Models\ServiceItem;
use App\Models\Setting;
use App\Models\Tenant;
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

        $meters = Meter::where('room_id', $contract->room_id)->where('is_active', true)->orderBy('type')->get();
        $meterRows = [];

        foreach ($meters as $meter) {
            $last = $this->readings->lastReadingBefore($meter->id);
            $meterRows[] = [
                'meter_id' => $meter->id,
                'type' => $meter->type,
                'prev_reading' => $last?->reading ?? (float) $meter->initial_reading,
                'prev_read_date' => $last?->read_date?->toDateString() ?? $meter->installed_at->toDateString(),
            ];
        }

        return [
            'contract_id' => $contract->id,
            'room_code' => $contract->room->code,
            'tenant_name' => $contract->tenant?->full_name,
            'period_from' => $from,
            'period_to' => $endDate,
            'days' => Carbon::parse($from)->diffInDays(Carbon::parse($endDate)) + 1,
            'rent_amount' => $contract->rent_amount,
            'deposit_held' => $contract->depositHeld(),
            'carried_over' => $this->billing->carriedOver($contract->id, $periodYm),
            'meters' => $meterRows,
        ];
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

        return DB::transaction(function () use ($contract, $data) {
            $endDate = $data['end_date'];
            $periodYm = Carbon::parse($endDate)->format('Ym');

            // 1. Chốt số đồng hồ tại ngày trả — đoạn này thuộc về khách đang ở.
            foreach ($data['meter_readings'] ?? [] as $entry) {
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

            // 2. Kỳ này có thể đã chốt sổ trước khi khách báo trả phòng. Hoá đơn cũ
            //    phủ tới cuối tháng nên sai; huỷ nó để dựng lại theo ngày trả thực tế.
            //    Chỉ tự huỷ khi chưa thu đồng nào — có tiền rồi thì người dùng phải tự quyết.
            $existing = Invoice::where('contract_id', $contract->id)
                ->where('period_ym', $periodYm)
                ->whereNotIn('status', [Code::INVOICE_VOID])
                ->first();

            if ($existing) {
                if ($existing->paid_amount > 0) {
                    throw new RuntimeException(
                        "Kỳ {$periodYm} đã có hoá đơn {$existing->code} và đã thu ".
                        number_format($existing->paid_amount, 0, ',', '.').'đ. '.
                        'Xử lý hoá đơn đó trước (hoàn tiền hoặc điều chỉnh) rồi tất toán lại.'
                    );
                }

                $this->billing->void($existing, 'Khách trả phòng '.$endDate.' — dựng lại hoá đơn tất toán');
            }

            // 3. Kết thúc hợp đồng TRƯỚC khi dựng hoá đơn để biên kỳ tính đúng tới ngày trả.
            $contract->update([
                'actual_end_date' => $endDate,
                'status' => Code::CONTRACT_ENDED,
            ]);

            // 4. Hoá đơn tất toán — dùng chung cỗ máy chốt sổ, chỉ khác cờ is_settlement.
            $preview = $this->billing->preview($periodYm);
            $draft = collect($preview['invoices'])->firstWhere('contract_id', $contract->id);

            if (! $draft) {
                throw new RuntimeException(
                    'Không dựng được hoá đơn tất toán cho hợp đồng này. Kiểm tra lại chỉ số đồng hồ và kỳ '.$periodYm.'.'
                );
            }

            $discount = (int) ($data['discount'] ?? 0);
            $total = $draft['subtotal'] - $discount + $draft['carried_over'];

            $invoice = Invoice::create([
                'code' => "STL-{$periodYm}-{$contract->room->code}",
                'contract_id' => $contract->id,
                'room_id' => $contract->room_id,
                'period_ym' => $periodYm,
                'period_from' => $draft['period_from'],
                'period_to' => $draft['period_to'],
                'issue_date' => Carbon::today()->toDateString(),
                'due_date' => $endDate,
                'subtotal' => $draft['subtotal'],
                'discount' => $discount,
                'carried_over' => $draft['carried_over'],
                'total' => $total,
                'paid_amount' => 0,
                'is_settlement' => true,
                'status' => Code::INVOICE_ISSUED,
                'note' => $data['note'] ?? null,
            ]);

            foreach ($draft['details'] as $i => $line) {
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

            if ($draft['reading_ids']) {
                \App\Models\MeterReading::whereIn('id', $draft['reading_ids'])->update(['is_billed' => true]);
            }

            // 4. Xử lý cọc: trừ hỏng hóc rồi hoàn phần còn lại.
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
