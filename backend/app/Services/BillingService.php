<?php

namespace App\Services;

use App\Enums\Code;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\InvoiceDetail;
use App\Models\MeterReading;
use App\Models\Payment;
use App\Models\Room;
use App\Models\ServiceItem;
use App\Models\Setting;
use App\Support\AuditLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Chốt sổ, phát hành hoá đơn, thu tiền.
 *
 * Quy tắc bất biến (docs/02-schema.sql):
 *   - invoice_details SNAPSHOT unit_price + description, không join lại contract_services
 *   - mỗi meter_readings được tiêu thụ đúng một lần (is_billed)
 *   - chốt sổ idempotent: unique(contract_id, period_ym)
 */
class BillingService
{
    public function __construct(private MeterReadingService $readings) {}

    /**
     * Xem trước kỳ chốt sổ. Không ghi gì vào DB.
     *
     * @return array{period_ym: string, period_from: string, period_to: string,
     *               invoices: array, owner_expenses: array, warnings: array, total: int}
     */
    public function preview(string $periodYm): array
    {
        $periodFrom = $this->readings->firstDayOf($periodYm);
        $periodTo = $this->readings->lastDayOf($periodYm);

        $drafts = [];
        $total = 0;

        foreach ($this->billableContracts($periodYm, $periodFrom, $periodTo) as $contract) {
            $draft = $this->buildDraft($contract, $periodYm, $periodFrom, $periodTo);
            $drafts[] = $draft;
            $total += $draft['total'];
        }

        return [
            'period_ym' => $periodYm,
            'period_from' => $periodFrom,
            'period_to' => $periodTo,
            'invoices' => $drafts,
            'owner_expenses' => $this->ownerExpenseDrafts($periodTo),
            'warnings' => $this->warnings($periodYm, $periodFrom, $periodTo),
            'total' => $total,
        ];
    }

    /**
     * Chốt sổ thật: tạo hoá đơn nháp + chi phí chủ nhà, đánh dấu chỉ số đã dùng.
     *
     * Chốt được từng phần để một phòng có vấn đề không chặn cả kỳ:
     *   - không truyền gì            → chốt tất cả
     *   - $contractIds               → chỉ những hợp đồng đó
     *   - $expenseRoomIds            → chỉ những dòng chi phí phòng trống đó
     *
     * Idempotent ở mọi chế độ: preview đã loại hợp đồng có hoá đơn còn hiệu lực.
     */
    public function commit(string $periodYm, ?array $contractIds = null, ?array $expenseRoomIds = null): array
    {
        $preview = $this->preview($periodYm);
        $partial = $contractIds !== null || $expenseRoomIds !== null;

        if ($contractIds !== null) {
            $preview['invoices'] = array_values(array_filter(
                $preview['invoices'],
                fn ($d) => in_array($d['contract_id'], $contractIds, true)
            ));
        }

        if ($partial) {
            $rooms = $expenseRoomIds ?? [];
            $preview['owner_expenses'] = array_values(array_filter(
                $preview['owner_expenses'],
                fn ($e) => in_array($e['room_id'], $rooms, true)
            ));
        }

        return DB::transaction(function () use ($preview, $periodYm, $partial) {
            $created = [];

            foreach ($preview['invoices'] as $draft) {
                $invoice = Invoice::create([
                    'code' => $this->invoiceCode($periodYm, $draft['room_code']),
                    'contract_id' => $draft['contract_id'],
                    'room_id' => $draft['room_id'],
                    'period_ym' => $periodYm,
                    'period_from' => $draft['period_from'],
                    'period_to' => $draft['period_to'],
                    'issue_date' => Carbon::today()->toDateString(),
                    'due_date' => Carbon::today()->addDays((int) Setting::get('due_days', 5))->toDateString(),
                    'subtotal' => $draft['subtotal'],
                    'discount' => 0,
                    'carried_over' => $draft['carried_over'],
                    'total' => $draft['total'],
                    'paid_amount' => 0,
                    'is_settlement' => false,
                    'status' => Code::INVOICE_DRAFT,
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

                // Chỉ số đã biến thành tiền — chặn tính lần hai.
                if ($draft['reading_ids']) {
                    MeterReading::whereIn('id', $draft['reading_ids'])->update(['is_billed' => true]);
                }

                $created[] = $invoice->id;
            }

            $expenses = 0;
            foreach ($preview['owner_expenses'] as $draft) {
                Expense::create([
                    'building_id' => $draft['building_id'],
                    'room_id' => $draft['room_id'],
                    'category' => Code::EXPENSE_UTILITY,
                    'period_ym' => $periodYm,
                    'amount' => $draft['amount'],
                    'spent_at' => $preview['period_to'],
                    'vendor' => null,
                    'note' => $draft['description'],
                ]);

                MeterReading::whereIn('id', $draft['reading_ids'])->update(['is_billed' => true]);
                $expenses++;
            }

            // Đoạn tiêu thụ 0 của phòng trống không thành tiền cho ai. Nếu không
            // đóng lại, chúng nằm mãi trong hàng chờ và làm nhiễu cảnh báo.
            // Chỉ dọn khi chốt cả kỳ — chốt lẻ từng phòng không được đụng phòng khác.
            if (! $partial) {
                MeterReading::whereNull('contract_id')
                    ->where('is_billed', false)
                    ->where('consumption', '<=', 0)
                    ->where('read_date', '<=', $preview['period_to'])
                    ->update(['is_billed' => true]);
            }

            AuditLog::info(AuditLog::BILLING, sprintf(
                'Chốt sổ kỳ %s%s: tạo %d hoá đơn, %d dòng chi phí',
                $periodYm,
                $partial ? ' (chốt lẻ)' : ' (cả kỳ)',
                count($created),
                $expenses
            ), ['invoice_ids' => $created]);

            return [
                'invoice_ids' => $created,
                'invoice_count' => count($created),
                'expense_count' => $expenses,
            ];
        });
    }

    /** Hợp đồng cần ra hoá đơn cho kỳ — bao gồm HĐ đã kết thúc giữa kỳ. */
    private function billableContracts(string $periodYm, string $periodFrom, string $periodTo)
    {
        return Contract::with(['tenant', 'room.building', 'services.serviceItem'])
            ->whereIn('status', [Code::CONTRACT_ACTIVE, Code::CONTRACT_ENDED])
            ->where('start_date', '<=', $periodTo)
            // Hoá đơn đã huỷ không tính là "đã chốt sổ" — huỷ xong phải chốt lại được.
            ->whereDoesntHave('invoices', fn ($q) => $q
                ->where('period_ym', $periodYm)
                ->where('status', '!=', Code::INVOICE_VOID))
            ->get()
            ->filter(function (Contract $c) use ($periodFrom) {
                $end = $c->effectiveEndDate();

                return $end === null || $end >= $periodFrom;
            });
    }

    /** Dựng các dòng hoá đơn cho một hợp đồng. Không ghi DB. */
    private function buildDraft(Contract $contract, string $periodYm, string $periodFrom, string $periodTo): array
    {
        // Thu hẹp biên kỳ theo ngày vào / ngày trả phòng thực tế.
        $from = max($periodFrom, $contract->start_date->toDateString());
        $end = $contract->effectiveEndDate();
        $to = $end !== null ? min($periodTo, $end) : $periodTo;

        $details = [];
        $readingIds = [];

        // --- Tiền phòng: nguồn duy nhất là contracts.rent_amount ---
        $details[] = $this->rentLine($contract, $periodYm, $from, $to);

        // --- Phí dịch vụ từ contract_services (chỉ item có is_service = 1) ---
        foreach ($contract->services->where('is_active', true) as $cs) {
            $item = $cs->serviceItem;
            if (! $item || ! $item->is_active) {
                continue;
            }

            $line = match ($item->pricing_mode) {
                Code::PRICE_PER_UNIT => $this->meteredLine($contract, $item, $cs, $to, $readingIds),
                Code::PRICE_PER_PERSON => [
                    'service_item_id' => $item->id,
                    'description' => "{$item->name} — {$contract->occupant_count} người",
                    'quantity' => $contract->occupant_count,
                    'unit_price' => $cs->unit_price,
                    'amount' => $contract->occupant_count * $cs->unit_price,
                ],
                Code::PRICE_PER_DAY => $this->perDayLine($item, $cs, $from, $to),
                default => $this->fixedLine($item, $cs),
            };

            if ($line !== null && $line['amount'] !== 0) {
                $details[] = $line;
            }
        }

        $subtotal = array_sum(array_column($details, 'amount'));
        $carriedOver = $this->carriedOver($contract->id, $periodYm);

        return [
            'contract_id' => $contract->id,
            'room_id' => $contract->room_id,
            'room_code' => $contract->room->code,
            'building_name' => $contract->room->building->name,
            'tenant_name' => $contract->tenant?->full_name,
            'period_from' => $from,
            'period_to' => $to,
            'details' => $details,
            'reading_ids' => $readingIds,
            'subtotal' => $subtotal,
            'carried_over' => $carriedOver,
            'total' => $subtotal + $carriedOver,
        ];
    }

    /**
     * Tiền phòng. Ở trọn kỳ → 1 tháng. Ở lẻ → quy về đơn giá NGÀY,
     * làm tròn đơn giá trước rồi mới nhân (docs/02-schema.sql).
     */
    private function rentLine(Contract $contract, string $periodYm, string $from, string $to): array
    {
        $rentItem = ServiceItem::where('code', 'rent')->first();
        $periodFrom = $this->readings->firstDayOf($periodYm);
        $periodTo = $this->readings->lastDayOf($periodYm);

        if ($from === $periodFrom && $to === $periodTo) {
            return [
                'service_item_id' => $rentItem->id,
                'description' => 'Tiền phòng '.Carbon::parse($from)->format('m/Y'),
                'quantity' => 1,
                'unit_price' => $contract->rent_amount,
                'amount' => $contract->rent_amount,
            ];
        }

        $daysInMonth = Carbon::parse($periodFrom)->daysInMonth;
        $daysStayed = Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1;
        $unitPrice = (int) round($contract->rent_amount / $daysInMonth);

        return [
            'service_item_id' => $rentItem->id,
            'description' => sprintf(
                'Tiền phòng %s-%s (%d ngày)',
                Carbon::parse($from)->format('d/m'),
                Carbon::parse($to)->format('d/m'),
                $daysStayed
            ),
            'quantity' => $daysStayed,
            'unit_price' => $unitPrice,
            'amount' => $unitPrice * $daysStayed,
        ];
    }

    /**
     * Dòng điện/nước: gom mọi đoạn tiêu thụ chưa tính tiền của hợp đồng này.
     * Quét theo is_billed thay vì period_ym nên tháng quên ghi sẽ tự dồn vào kỳ này.
     */
    private function meteredLine(Contract $contract, ServiceItem $item, $cs, string $to, array &$readingIds): ?array
    {
        $rows = MeterReading::query()
            ->join('meters', 'meters.id', '=', 'meter_readings.meter_id')
            ->where('meter_readings.contract_id', $contract->id)
            ->where('meter_readings.is_billed', false)
            ->where('meter_readings.read_date', '<=', $to)
            ->where('meters.type', $item->meter_type)
            ->orderBy('meter_readings.read_date')
            ->select('meter_readings.*')
            ->get();

        if ($rows->isEmpty()) {
            return null;
        }

        $qty = round($rows->sum('consumption'), 2);
        foreach ($rows as $r) {
            $readingIds[] = $r->id;
        }

        $first = $rows->first();
        $lastRow = $rows->last();
        $unit = $item->unit_label ?? '';

        $description = $rows->count() === 1
            ? sprintf('%s %s → %s (%s %s)', $item->name, $this->num($first->prev_reading), $this->num($first->reading), $this->num($qty), $unit)
            : sprintf('%s %s → %s, %d lần đọc (%s %s)', $item->name, $this->num($first->prev_reading), $this->num($lastRow->reading), $rows->count(), $this->num($qty), $unit);

        return [
            'service_item_id' => $item->id,
            'description' => $description,
            'meter_reading_id' => $lastRow->id,
            'quantity' => $qty,
            'unit_price' => $cs->unit_price,
            'amount' => (int) round($qty * $cs->unit_price),
        ];
    }

    private function fixedLine(ServiceItem $item, $cs): array
    {
        $qty = $cs->quantity_fixed ?? 1;
        $suffix = $cs->quantity_fixed ? " × {$this->num($qty)} {$item->unit_label}" : '';

        return [
            'service_item_id' => $item->id,
            'description' => $item->name.$suffix,
            'quantity' => $qty,
            'unit_price' => $cs->unit_price,
            'amount' => (int) round($qty * $cs->unit_price),
        ];
    }

    private function perDayLine(ServiceItem $item, $cs, string $from, string $to): array
    {
        $days = Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1;

        return [
            'service_item_id' => $item->id,
            'description' => "{$item->name} — {$days} ngày",
            'quantity' => $days,
            'unit_price' => $cs->unit_price,
            'amount' => $days * $cs->unit_price,
        ];
    }

    /**
     * Đoạn tiêu thụ phòng trống (contract_id NULL) → chi phí của chủ.
     * Đơn giá lấy từ service_items.default_price vì không có hợp đồng nào để tra.
     */
    private function ownerExpenseDrafts(string $periodTo): array
    {
        $rows = MeterReading::query()
            ->join('meters', 'meters.id', '=', 'meter_readings.meter_id')
            ->whereNull('meter_readings.contract_id')
            ->where('meter_readings.is_billed', false)
            ->where('meter_readings.read_date', '<=', $periodTo)
            ->where('meter_readings.consumption', '>', 0)
            ->select('meter_readings.*', 'meters.type as meter_type')
            ->get()
            ->groupBy(fn ($r) => $r->room_id.'-'.$r->meter_type);

        $drafts = [];

        foreach ($rows as $group) {
            $first = $group->first();
            $room = Room::with('building')->find($first->room_id);
            $item = ServiceItem::where('meter_type', $first->meter_type)->first();
            if (! $item) {
                continue;
            }

            $qty = round($group->sum('consumption'), 2);

            $drafts[] = [
                'room_id' => $room?->id,
                'building_id' => $room?->building_id,
                'room_code' => $room?->code,
                'description' => sprintf(
                    'Phòng %s trống — %s %s %s',
                    $room?->code,
                    strtolower($item->name),
                    $this->num($qty),
                    $item->unit_label
                ),
                'quantity' => $qty,
                'unit_price' => $item->default_price,
                'amount' => (int) round($qty * $item->default_price),
                'reading_ids' => $group->pluck('id')->all(),
            ];
        }

        return $drafts;
    }

    /** Nợ các kỳ trước chuyển sang. */
    public function carriedOver(int $contractId, string $periodYm): int
    {
        return (int) Invoice::where('contract_id', $contractId)
            ->where('period_ym', '<', $periodYm)
            ->whereNotIn('status', [Code::INVOICE_DRAFT, Code::INVOICE_VOID, Code::INVOICE_PAID])
            ->get()
            ->sum(fn (Invoice $i) => max(0, $i->total - $i->paid_amount));
    }

    /** Cảnh báo trước khi chốt — phải nói rõ cái gì bị bỏ qua. */
    private function warnings(string $periodYm, string $periodFrom, string $periodTo): array
    {
        $warnings = [];

        // Phòng đang thuê mà chưa ghi số TRONG KỲ → hoá đơn sẽ thiếu điện nước.
        // Kiểm theo khoảng ngày của kỳ, không theo is_billed: chỉ số cũ còn sót
        // trong hàng chờ (vd đoạn 0 kWh lúc nhận khách) không có nghĩa là đã ghi số kỳ này.
        $occupied = Room::with('building')->where('status', Code::ROOM_OCCUPIED)->get();

        foreach ($occupied as $room) {
            $hasReadingInPeriod = MeterReading::where('room_id', $room->id)
                ->whereBetween('read_date', [$periodFrom, $periodTo])
                ->exists();

            $alreadyInvoiced = Invoice::where('room_id', $room->id)
                ->where('period_ym', $periodYm)
                ->exists();

            if (! $hasReadingInPeriod && ! $alreadyInvoiced) {
                $warnings[] = [
                    'level' => 'warning',
                    'message' => "Phòng {$room->code} chưa ghi số điện nước kỳ này — hoá đơn sẽ chỉ có tiền phòng và phí cố định.",
                ];
            }
        }

        // Kỳ trước còn phòng chưa chốt sổ.
        $prev = Carbon::createFromFormat('Ymd', $periodYm.'01')->subMonth()->format('Ym');
        $prevUnbilled = MeterReading::where('period_ym', $prev)->where('is_billed', false)->count();
        if ($prevUnbilled > 0) {
            $warnings[] = [
                'level' => 'danger',
                'message' => "Kỳ {$prev} còn {$prevUnbilled} chỉ số chưa tính tiền — sẽ được dồn vào kỳ này.",
            ];
        }

        return $warnings;
    }

    // -----------------------------------------------------------------
    // Phát hành / huỷ / thu tiền
    // -----------------------------------------------------------------

    /**
     * Sửa chi tiết hoá đơn khi CHƯA thu đồng nào (kể cả đã phát hành).
     *
     * Rủi ro của việc cho sửa trực tiếp là invoice_details và meter_readings lệch nhau.
     * Nên khi sửa số lượng của một dòng điện/nước, service ghi ngược chỉ số về
     * meter_readings để hai bảng luôn kể cùng một câu chuyện.
     *
     * @param  array  $lines  [['id' => int, 'quantity' => float, 'unit_price' => int], ...]
     * @return array{invoice: Invoice, synced: array, unsynced: array}
     */
    public function updateDetails(Invoice $invoice, array $lines, ?int $discount = null, ?string $note = null): array
    {
        if (! $invoice->isEditable()) {
            throw new RuntimeException($invoice->lockReason());
        }

        return DB::transaction(function () use ($invoice, $lines, $discount, $note) {
            $synced = [];
            $unsynced = [];

            foreach ($lines as $line) {
                $detail = InvoiceDetail::where('invoice_id', $invoice->id)->findOrFail($line['id']);

                $quantity = round((float) $line['quantity'], 3);
                $unitPrice = (int) $line['unit_price'];
                $oldQuantity = (float) $detail->quantity;

                $detail->update([
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'amount' => (int) round($quantity * $unitPrice),
                ]);

                if ($detail->meter_reading_id && abs($quantity - $oldQuantity) > 0.0001) {
                    $result = $this->syncReadingFromDetail($detail, $oldQuantity, $quantity);
                    $result ? $synced[] = $result : $unsynced[] = $detail->description;
                }
            }

            $subtotal = (int) InvoiceDetail::where('invoice_id', $invoice->id)->sum('amount');
            $finalDiscount = $discount ?? $invoice->discount;
            $oldTotal = $invoice->total;

            $invoice->update([
                'subtotal' => $subtotal,
                'discount' => $finalDiscount,
                'total' => $subtotal - $finalDiscount + $invoice->carried_over,
                'note' => $note ?? $invoice->note,
            ]);

            // Sửa hoá đơn là hành động dễ gây tranh cãi với khách nhất — ghi vết đầy đủ
            // cả số cũ, số mới và chỉ số nào bị ghi ngược vào sổ đồng hồ.
            AuditLog::warning(AuditLog::BILLING, sprintf(
                'Sửa hoá đơn %s: tổng %s → %s',
                $invoice->code,
                number_format($oldTotal, 0, ',', '.'),
                number_format($invoice->total, 0, ',', '.')
            ), [
                'invoice_id' => $invoice->id,
                'synced_readings' => $synced,
                'unsynced_lines' => $unsynced,
            ]);

            return ['invoice' => $invoice->refresh(), 'synced' => $synced, 'unsynced' => $unsynced];
        });
    }

    /**
     * Ghi ngược số tiêu thụ đã sửa về meter_readings.
     *
     * Chỉ đồng bộ khi dòng hoá đơn ứng với ĐÚNG MỘT lần đọc — nhận biết bằng việc
     * consumption của lần đọc đó khớp số lượng cũ trên hoá đơn. Nếu dòng gộp nhiều
     * lần đọc (tháng quên ghi bị dồn) thì không đoán bừa, trả về null để báo người dùng.
     */
    private function syncReadingFromDetail(InvoiceDetail $detail, float $oldQuantity, float $newQuantity): ?array
    {
        $reading = MeterReading::find($detail->meter_reading_id);

        if (! $reading || abs((float) $reading->consumption - $oldQuantity) > 0.0001) {
            return null;
        }

        $reading->update([
            'consumption' => $newQuantity,
            'reading' => round($reading->prev_reading + $newQuantity, 2),
            'note' => trim(($reading->note ?? '')."\nSửa từ hoá đơn {$detail->invoice_id}: "
                .$this->num($oldQuantity).' → '.$this->num($newQuantity)),
        ]);

        // Mô tả là SNAPSHOT text, không tự tính lại khi render — phải viết lại tay,
        // nếu không hoá đơn sẽ ghi "150 kWh" trong khi số lượng đã là 132.
        $item = $detail->serviceItem;
        if ($item) {
            $detail->update([
                'description' => sprintf(
                    '%s %s → %s (%s %s)',
                    $item->name,
                    $this->num($reading->prev_reading),
                    $this->num($reading->reading),
                    $this->num($newQuantity),
                    $item->unit_label ?? ''
                ),
            ]);
        }

        return [
            'reading_id' => $reading->id,
            'from' => $oldQuantity,
            'to' => $newQuantity,
            'new_reading' => (float) $reading->reading,
        ];
    }

    public function issue(Invoice $invoice): Invoice
    {
        if ($invoice->status !== Code::INVOICE_DRAFT) {
            throw new RuntimeException('Chỉ hoá đơn nháp mới phát hành được.');
        }

        $invoice->update([
            'status' => Code::INVOICE_ISSUED,
            'issue_date' => Carbon::today()->toDateString(),
        ]);

        AuditLog::info(AuditLog::BILLING, sprintf(
            'Phát hành hoá đơn %s · phòng %s · %s',
            $invoice->code,
            $invoice->room?->code,
            number_format($invoice->total, 0, ',', '.')
        ), ['invoice_id' => $invoice->id]);

        return $invoice->refresh();
    }

    /** Huỷ hoá đơn: trả chỉ số về hàng chờ để ghi/chốt lại. */
    public function void(Invoice $invoice, ?string $reason = null): Invoice
    {
        if ($invoice->status === Code::INVOICE_PAID) {
            throw new RuntimeException('Hoá đơn đã thu đủ — không huỷ được. Hoàn tiền rồi tạo hoá đơn điều chỉnh.');
        }

        return DB::transaction(function () use ($invoice, $reason) {
            $readingIds = $invoice->details()->whereNotNull('meter_reading_id')->pluck('meter_reading_id');
            if ($readingIds->isNotEmpty()) {
                MeterReading::whereIn('id', $readingIds)->update(['is_billed' => false]);
            }

            $invoice->update([
                'status' => Code::INVOICE_VOID,
                'note' => trim(($invoice->note ?? '')."\nHuỷ: ".($reason ?? 'không ghi lý do')),
            ]);

            AuditLog::warning(AuditLog::BILLING, sprintf(
                'Huỷ hoá đơn %s · %s · lý do: %s',
                $invoice->code,
                number_format($invoice->total, 0, ',', '.'),
                $reason ?? 'không ghi'
            ), [
                'invoice_id' => $invoice->id,
                'released_readings' => $readingIds->all(),
            ]);

            return $invoice->refresh();
        });
    }

    public function recordPayment(Invoice $invoice, int $amount, string $paidAt, string $method, ?string $refNo = null, ?string $note = null): Payment
    {
        if ($invoice->status === Code::INVOICE_DRAFT) {
            throw new RuntimeException('Phát hành hoá đơn trước khi thu tiền.');
        }
        if ($invoice->status === Code::INVOICE_VOID) {
            throw new RuntimeException('Hoá đơn đã huỷ.');
        }

        return DB::transaction(function () use ($invoice, $amount, $paidAt, $method, $refNo, $note) {
            $payment = Payment::create([
                'contract_id' => $invoice->contract_id,
                'invoice_id' => $invoice->id,
                'kind' => Code::PAY_RENT,
                'amount' => $amount,
                'paid_at' => $paidAt,
                'method' => $method,
                'ref_no' => $refNo,
                'note' => $note,
            ]);

            $this->syncPaidAmount($invoice);

            AuditLog::info(AuditLog::BILLING, sprintf(
                'Thu tiền %s cho %s · còn lại %s',
                number_format($amount, 0, ',', '.'),
                $invoice->code,
                number_format($invoice->refresh()->remaining(), 0, ',', '.')
            ), [
                'invoice_id' => $invoice->id,
                'payment_id' => $payment->id,
                'method' => $method,
                'ref_no' => $refNo,
            ]);

            return $payment;
        });
    }

    /** Đồng bộ paid_amount + status từ bảng payments — nguồn sự thật là payments. */
    public function syncPaidAmount(Invoice $invoice): void
    {
        $paid = (int) Payment::where('invoice_id', $invoice->id)->sum('amount');

        $status = match (true) {
            $paid >= $invoice->total => Code::INVOICE_PAID,
            $paid > 0 => Code::INVOICE_PARTIAL,
            default => Code::INVOICE_ISSUED,
        };

        $invoice->update(['paid_amount' => $paid, 'status' => $status]);
    }

    private function invoiceCode(string $periodYm, string $roomCode): string
    {
        $base = "INV-{$periodYm}-{$roomCode}";
        $suffix = 0;
        $code = $base;

        while (Invoice::where('code', $code)->exists()) {
            $code = $base.'-'.(++$suffix);
        }

        return $code;
    }

    /** Bỏ .00 cho số nguyên để mô tả hoá đơn đọc gọn. */
    private function num(float|int $value): string
    {
        return rtrim(rtrim(number_format((float) $value, 2, ',', '.'), '0'), ',');
    }
}
