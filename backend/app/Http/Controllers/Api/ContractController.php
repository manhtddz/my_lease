<?php

namespace App\Http\Controllers\Api;

use App\Enums\Code;
use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Meter;
use App\Models\Room;
use App\Services\MeterReadingService;
use App\Services\TenancyService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use RuntimeException;

class ContractController extends Controller
{
    public function __construct(
        private TenancyService $tenancy,
        private MeterReadingService $readings,
    ) {}

    public function index(Request $request)
    {
        $rows = Contract::with(['tenant', 'room.building'])
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('room_id'), fn ($q, $v) => $q->where('room_id', $v))
            ->orderByDesc('start_date')
            ->get()
            ->map(fn (Contract $c) => [
                'id' => $c->id,
                'code' => $c->code,
                'room_code' => $c->room->code,
                'building_name' => $c->room->building->name,
                'tenant_name' => $c->tenant?->full_name,
                'tenant_phone' => $c->tenant?->phone,
                'start_date' => $c->start_date->toDateString(),
                'end_date' => $c->end_date?->toDateString(),
                'actual_end_date' => $c->actual_end_date?->toDateString(),
                'rent_amount' => $c->rent_amount,
                'deposit_amount' => $c->deposit_amount,
                'deposit_held' => $c->depositHeld(),
                'occupant_count' => $c->occupant_count,
                'status' => $c->status,
            ]);

        return response()->json(['rows' => $rows]);
    }

    public function show(Contract $contract)
    {
        $contract->load(['tenant', 'room.building', 'occupants', 'services.serviceItem', 'invoices', 'payments']);

        return response()->json([
            'contract' => [
                'id' => $contract->id,
                'code' => $contract->code,
                'room_id' => $contract->room_id,
                'room_code' => $contract->room->code,
                'building_name' => $contract->room->building->name,
                'start_date' => $contract->start_date->toDateString(),
                'end_date' => $contract->end_date?->toDateString(),
                'actual_end_date' => $contract->actual_end_date?->toDateString(),
                'rent_amount' => $contract->rent_amount,
                'deposit_amount' => $contract->deposit_amount,
                'deposit_held' => $contract->depositHeld(),
                'occupant_count' => $contract->occupant_count,
                'status' => $contract->status,
                'note' => $contract->note,
            ],
            'tenant' => $contract->tenant,
            'occupants' => $contract->occupants,
            'services' => $contract->services->map(fn ($s) => [
                'id' => $s->id,
                'service_item_id' => $s->service_item_id,
                'name' => $s->serviceItem?->name,
                'pricing_mode' => $s->serviceItem?->pricing_mode,
                'unit_label' => $s->serviceItem?->unit_label,
                'unit_price' => $s->unit_price,
                'quantity_fixed' => $s->quantity_fixed,
                'is_active' => $s->is_active,
            ]),
            'invoices' => $contract->invoices->map(fn ($i) => [
                'id' => $i->id,
                'code' => $i->code,
                'period_ym' => $i->period_ym,
                'total' => $i->total,
                'paid_amount' => $i->paid_amount,
                'status' => $i->status,
            ]),
            'payments' => $contract->payments->map(fn ($p) => [
                'id' => $p->id,
                'kind' => $p->kind,
                'amount' => $p->amount,
                'paid_at' => $p->paid_at->toDateString(),
                'note' => $p->note,
            ]),
        ]);
    }

    /** Dữ liệu prefill cho wizard nhận khách mới. */
    public function moveInDefaults(Request $request)
    {
        $roomId = (int) $request->query('room_id');
        $room = Room::with('building')->findOrFail($roomId);

        $meters = Meter::where('room_id', $roomId)->where('is_active', true)->orderBy('type')->get()
            ->map(function (Meter $m) {
                $last = $this->readings->lastReadingBefore($m->id);

                return [
                    'meter_id' => $m->id,
                    'type' => $m->type,
                    'prev_reading' => $last?->reading ?? (float) $m->initial_reading,
                    'prev_read_date' => $last?->read_date?->toDateString() ?? $m->installed_at->toDateString(),
                ];
            });

        return response()->json([
            'room' => [
                'id' => $room->id,
                'code' => $room->code,
                'building_name' => $room->building->name,
                'default_rent' => $room->default_rent,
                'status' => $room->status,
            ],
            'services' => $this->tenancy->serviceDefaults(),
            'meters' => $meters,
            'today' => Carbon::today()->toDateString(),
        ]);
    }

    public function moveIn(Request $request)
    {
        $data = $request->validate([
            'room_id' => ['required', 'integer'],
            'tenant_id' => ['nullable', 'integer'],
            'tenant.full_name' => ['required_without:tenant_id', 'string', 'max:255'],
            'tenant.phone' => ['nullable', 'string', 'max:20'],
            'tenant.id_card_no' => ['nullable', 'string', 'max:20'],
            'tenant.dob' => ['nullable', 'date'],
            'tenant.gender' => ['nullable', 'string', 'size:1'],
            'tenant.hometown' => ['nullable', 'string', 'max:500'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'rent_amount' => ['required', 'integer', 'min:0'],
            'deposit_amount' => ['nullable', 'integer', 'min:0'],
            'occupant_count' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string'],
            'occupants' => ['nullable', 'array'],
            'occupants.*.full_name' => ['required', 'string', 'max:255'],
            'services' => ['nullable', 'array'],
            'services.*.service_item_id' => ['required', 'integer'],
            'services.*.unit_price' => ['required', 'integer', 'min:0'],
            'services.*.quantity_fixed' => ['nullable', 'numeric', 'min:0'],
            // Chốt số đồng hồ là BẮT BUỘC — điểm khởi đầu chuỗi đọc của khách mới.
            'meter_readings' => ['required', 'array', 'min:1'],
            'meter_readings.*.meter_id' => ['required', 'integer'],
            'meter_readings.*.reading' => ['required', 'numeric', 'min:0'],
        ]);

        try {
            $contract = $this->tenancy->moveIn($data);

            return response()->json(['contract_id' => $contract->id, 'code' => $contract->code], 201);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function moveOutPreview(Request $request, Contract $contract)
    {
        $endDate = $request->query('end_date', Carbon::today()->toDateString());

        return response()->json($this->tenancy->moveOutPreview($contract, $endDate));
    }

    /** Huỷ hợp đồng chưa tới ngày vào — khác trả phòng, xem TenancyService::cancel(). */
    public function cancel(Request $request, Contract $contract)
    {
        $data = $request->validate([
            'deposit_deduction' => ['nullable', 'integer', 'min:0', 'max:'.$contract->depositHeld()],
            'deduction_reason' => [
                Rule::requiredIf(fn () => (int) $request->input('deposit_deduction', 0) > 0),
                'nullable', 'string', 'max:500',
            ],
            'refund_deposit' => ['nullable', 'boolean'],
            'refund_method' => ['nullable', 'string', 'size:1'],
            'reason' => ['nullable', 'string', 'max:500'],
        ], [], [
            'deposit_deduction' => 'tiền phạt huỷ',
            'deduction_reason' => 'lý do phạt',
        ]);

        try {
            $cancelled = $this->tenancy->cancel($contract, $data);

            return response()->json(['cancelled' => true, 'code' => $cancelled->code]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function moveOut(Request $request, Contract $contract)
    {
        $data = $request->validate([
            // Chỉ chặn ngày trả trước ngày vào. KHÔNG chặn theo kỳ đã chốt sổ:
            // khách trả đủ tiền tới ngày 14 rồi đi ngày 14 là ca bình thường,
            // hoá đơn tất toán khi đó bằng 0 chứ không phải lỗi.
            'end_date' => ['required', 'date', 'after_or_equal:'.$contract->start_date->toDateString()],
            'meter_readings' => ['required', 'array', 'min:1'],
            'meter_readings.*.meter_id' => ['required', 'integer'],
            'meter_readings.*.reading' => ['required', 'numeric', 'min:0'],
            'discount' => ['nullable', 'integer', 'min:0'],
            'deposit_deduction' => ['nullable', 'integer', 'min:0', 'max:'.$contract->depositHeld()],
            // Trừ tiền của khách thì phải ghi lý do — chỉ bắt buộc khi số trừ > 0,
            // không dùng required_with vì nó kích hoạt cả khi truyền 0.
            'deduction_reason' => [
                Rule::requiredIf(fn () => (int) $request->input('deposit_deduction', 0) > 0),
                'nullable',
                'string',
                'max:500',
            ],
            'refund_deposit' => ['nullable', 'boolean'],
            'refund_method' => ['nullable', 'string', 'size:1'],
            'note' => ['nullable', 'string'],
        ], [], [
            // 'end_date' mặc định là "ngày hết hạn" (của hợp đồng) — ở đây nó là
            // ngày khách thực sự dọn đi.
            'end_date' => 'ngày trả phòng',
        ]);

        try {
            $invoice = $this->tenancy->moveOut($contract, $data);

            return response()->json(['invoice_id' => $invoice->id, 'code' => $invoice->code], 201);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** Sửa giá thuê / phí dịch vụ — chỉ áp dụng từ kỳ chưa chốt. */
    public function updatePricing(Request $request, Contract $contract)
    {
        $data = $request->validate([
            'rent_amount' => ['nullable', 'integer', 'min:0'],
            'occupant_count' => ['nullable', 'integer', 'min:1'],
            'services' => ['nullable', 'array'],
            'services.*.id' => ['required', 'integer'],
            'services.*.unit_price' => ['required', 'integer', 'min:0'],
            'services.*.quantity_fixed' => ['nullable', 'numeric', 'min:0'],
            'services.*.is_active' => ['nullable', 'boolean'],
        ]);

        $contract->update(array_filter([
            'rent_amount' => $data['rent_amount'] ?? null,
            'occupant_count' => $data['occupant_count'] ?? null,
        ], fn ($v) => $v !== null));

        foreach ($data['services'] ?? [] as $row) {
            $contract->services()->where('id', $row['id'])->update([
                'unit_price' => $row['unit_price'],
                'quantity_fixed' => $row['quantity_fixed'] ?? null,
                'is_active' => $row['is_active'] ?? true,
            ]);
        }

        return response()->json(['updated' => true]);
    }
}
