<?php

namespace App\Http\Controllers\Api;

use App\Enums\Code;
use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Setting;
use App\Services\BillingService;
use Illuminate\Http\Request;
use RuntimeException;

class InvoiceController extends Controller
{
    public function __construct(private BillingService $service) {}

    public function index(Request $request)
    {
        $rows = Invoice::with(['room.building', 'contract.tenant'])
            ->when($request->query('period'), fn ($q, $v) => $q->where('period_ym', $v))
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('room_id'), fn ($q, $v) => $q->where('room_id', $v))
            ->when($request->boolean('outstanding'), fn ($q) => $q->whereIn('status', [Code::INVOICE_ISSUED, Code::INVOICE_PARTIAL]))
            ->orderByDesc('period_ym')
            ->orderBy('room_id')
            ->get()
            ->map(fn (Invoice $i) => $this->summary($i));

        return response()->json(['rows' => $rows]);
    }

    public function show(Invoice $invoice)
    {
        $invoice->load(['details.serviceItem', 'room.building', 'contract.tenant', 'payments']);

        return response()->json([
            'invoice' => $this->summary($invoice),
            'details' => $invoice->details->map(fn ($d) => [
                'id' => $d->id,
                'service_name' => $d->serviceItem?->name,
                'description' => $d->description,
                'quantity' => $d->quantity,
                'unit_price' => $d->unit_price,
                'amount' => $d->amount,
                'meter_reading_id' => $d->meter_reading_id,
            ]),
            'payments' => $invoice->payments->map(fn ($p) => [
                'id' => $p->id,
                'amount' => $p->amount,
                'paid_at' => $p->paid_at->toDateString(),
                'method' => $p->method,
                'kind' => $p->kind,
                'ref_no' => $p->ref_no,
                'note' => $p->note,
            ]),
            'owner' => [
                'name' => Setting::get('owner_name'),
                'phone' => Setting::get('owner_phone'),
                'bank_account' => Setting::get('bank_account'),
                'bank_name' => Setting::get('bank_name'),
                'invoice_note' => Setting::get('invoice_note'),
            ],
        ]);
    }

    /** Sửa giảm giá / ghi chú — được phép khi chưa thu đồng nào. */
    public function update(Request $request, Invoice $invoice)
    {
        if (! $invoice->isEditable()) {
            return response()->json(['message' => $invoice->lockReason()], 422);
        }

        $data = $request->validate([
            'discount' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string'],
        ]);

        $discount = $data['discount'] ?? $invoice->discount;

        $invoice->update([
            'discount' => $discount,
            'note' => $data['note'] ?? $invoice->note,
            'total' => $invoice->subtotal - $discount + $invoice->carried_over,
        ]);

        return response()->json($this->summary($invoice->refresh()));
    }

    /**
     * Sửa chi tiết hoá đơn (số điện/nước, đơn giá) khi chưa thu tiền.
     * Số tiêu thụ sửa ở đây được ghi ngược về meter_readings để hai bảng không lệch.
     */
    public function updateDetails(Request $request, Invoice $invoice)
    {
        $data = $request->validate([
            'details' => ['required', 'array', 'min:1'],
            'details.*.id' => ['required', 'integer'],
            'details.*.quantity' => ['required', 'numeric', 'min:0'],
            'details.*.unit_price' => ['required', 'integer', 'min:0'],
            'discount' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string'],
        ]);

        try {
            $result = $this->service->updateDetails(
                $invoice,
                $data['details'],
                $data['discount'] ?? null,
                $data['note'] ?? null,
            );

            return response()->json([
                'invoice' => $this->summary($result['invoice']),
                'synced' => $result['synced'],
                'unsynced' => $result['unsynced'],
            ]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function issue(Invoice $invoice)
    {
        try {
            return response()->json($this->summary($this->service->issue($invoice)));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** Phát hành hàng loạt tất cả hoá đơn nháp của một kỳ. */
    public function issueAll(Request $request)
    {
        $data = $request->validate(['period_ym' => ['required', 'string', 'size:6']]);

        $issued = 0;
        foreach (Invoice::where('period_ym', $data['period_ym'])->where('status', Code::INVOICE_DRAFT)->get() as $invoice) {
            $this->service->issue($invoice);
            $issued++;
        }

        return response()->json(['issued' => $issued]);
    }

    public function destroy(Request $request, Invoice $invoice)
    {
        // Nháp thì xoá được thật; đã phát hành thì chỉ huỷ (giữ dấu vết chứng từ).
        if ($invoice->status === Code::INVOICE_DRAFT) {
            $invoice->details()->delete();
            $invoice->delete();

            return response()->json(['deleted' => true]);
        }

        try {
            return response()->json($this->summary(
                $this->service->void($invoice, $request->input('reason'))
            ));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function summary(Invoice $i): array
    {
        return [
            'id' => $i->id,
            'code' => $i->code,
            'contract_id' => $i->contract_id,
            'room_id' => $i->room_id,
            'room_code' => $i->room?->code,
            'building_name' => $i->room?->building?->name,
            'tenant_name' => $i->contract?->tenant?->full_name,
            'period_ym' => $i->period_ym,
            'period_from' => $i->period_from->toDateString(),
            'period_to' => $i->period_to->toDateString(),
            'issue_date' => $i->issue_date->toDateString(),
            'due_date' => $i->due_date?->toDateString(),
            'subtotal' => $i->subtotal,
            'discount' => $i->discount,
            'carried_over' => $i->carried_over,
            'total' => $i->total,
            'paid_amount' => $i->paid_amount,
            'remaining' => $i->remaining(),
            'is_settlement' => $i->is_settlement,
            'status' => $i->status,
            'note' => $i->note,
            'editable' => $i->isEditable(),
            'lock_reason' => $i->lockReason(),
        ];
    }
}
