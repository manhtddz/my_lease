<?php

namespace App\Http\Controllers\Api;

use App\Enums\Code;
use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\ServiceItem;
use App\Models\Setting;
use App\Models\Tenant;
use App\Services\BillingService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Các endpoint CRUD đơn giản: chi phí, danh mục, cấu hình, báo cáo, thu tiền.
 * Gom một controller vì mỗi cái chỉ vài dòng và không có nghiệp vụ phức tạp.
 */
class MiscController extends Controller
{
    public function __construct(private BillingService $billing) {}

    // ---------------------------------------------------------------- meta

    /** Nhãn tiếng Việt cho mọi mã CHAR(1) — FE lấy một lần rồi cache. */
    public function meta()
    {
        return response()->json([
            'labels' => Code::labels(),
            'today' => Carbon::today()->toDateString(),
            'current_period' => Carbon::today()->format('Ym'),
        ]);
    }

    public function tenants()
    {
        return response()->json(['rows' => Tenant::orderBy('full_name')->get()]);
    }

    // ------------------------------------------------------------- payments

    public function storePayment(Request $request, Invoice $invoice)
    {
        $data = $request->validate([
            'amount' => ['required', 'integer', 'min:1'],
            'paid_at' => ['required', 'date'],
            'method' => ['required', 'string', 'size:1'],
            'ref_no' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string'],
        ]);

        try {
            $payment = $this->billing->recordPayment(
                $invoice,
                $data['amount'],
                $data['paid_at'],
                $data['method'],
                $data['ref_no'] ?? null,
                $data['note'] ?? null,
            );

            return response()->json(['payment_id' => $payment->id], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function destroyPayment(Payment $payment)
    {
        $invoice = $payment->invoice;
        $payment->delete();

        if ($invoice) {
            $this->billing->syncPaidAmount($invoice->refresh());
        }

        return response()->json(['deleted' => true]);
    }

    // ------------------------------------------------------------- expenses

    public function expenses(Request $request)
    {
        $rows = Expense::with(['room', 'building'])
            ->when($request->query('period'), fn ($q, $v) => $q->where('period_ym', $v))
            ->orderByDesc('spent_at')
            ->limit(300)
            ->get()
            ->map(fn (Expense $e) => [
                'id' => $e->id,
                'category' => $e->category,
                'period_ym' => $e->period_ym,
                'amount' => $e->amount,
                'spent_at' => $e->spent_at->toDateString(),
                'vendor' => $e->vendor,
                'room_code' => $e->room?->code,
                'building_name' => $e->building?->name,
                'note' => $e->note,
            ]);

        return response()->json(['rows' => $rows]);
    }

    public function storeExpense(Request $request)
    {
        $data = $request->validate([
            'category' => ['required', 'string', 'size:1'],
            'amount' => ['required', 'integer', 'min:1'],
            'spent_at' => ['required', 'date'],
            'period_ym' => ['nullable', 'string', 'size:6'],
            'building_id' => ['nullable', 'integer'],
            'room_id' => ['nullable', 'integer'],
            'vendor' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string'],
        ]);

        $data['period_ym'] ??= Carbon::parse($data['spent_at'])->format('Ym');

        return response()->json(Expense::create($data), 201);
    }

    public function destroyExpense(Expense $expense)
    {
        $expense->delete();

        return response()->json(['deleted' => true]);
    }

    // --------------------------------------------------------- service items

    public function serviceItems()
    {
        return response()->json([
            'rows' => ServiceItem::orderBy('sort_order')->get(),
        ]);
    }

    public function updateServiceItem(Request $request, ServiceItem $serviceItem)
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'default_price' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $serviceItem->update(array_filter($data, fn ($v) => $v !== null));

        return response()->json($serviceItem->refresh());
    }

    // -------------------------------------------------------------- settings

    public function settings()
    {
        return response()->json([
            'rows' => Setting::all()->mapWithKeys(fn (Setting $s) => [
                $s->setting_key => ['value' => $s->setting_value, 'note' => $s->note],
            ]),
        ]);
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate(['values' => ['required', 'array']]);

        foreach ($data['values'] as $key => $value) {
            Setting::where('setting_key', $key)->update(['setting_value' => $value]);
        }

        return response()->json(['updated' => count($data['values'])]);
    }

    // --------------------------------------------------------------- reports

    /**
     * Lời lỗ theo tháng.
     * Doanh thu = subtotal - discount (KHÔNG dùng total vì total đã cộng
     * carried_over — sẽ tính doanh thu hai lần).
     */
    public function monthlyReport(Request $request)
    {
        $months = (int) $request->query('months', 12);
        $end = Carbon::today()->startOfMonth();
        $rows = [];

        for ($i = $months - 1; $i >= 0; $i--) {
            $period = $end->copy()->subMonths($i);
            $ym = $period->format('Ym');

            $income = (int) Invoice::where('period_ym', $ym)
                ->where('status', '!=', Code::INVOICE_VOID)
                ->get()
                ->sum(fn (Invoice $inv) => $inv->subtotal - $inv->discount);

            $collected = (int) Invoice::where('period_ym', $ym)
                ->where('status', '!=', Code::INVOICE_VOID)
                ->sum('paid_amount');

            $expense = (int) Expense::where('period_ym', $ym)->sum('amount');

            $rows[] = [
                'period_ym' => $ym,
                'label' => $period->format('m/Y'),
                'income' => $income,
                'collected' => $collected,
                'expense' => $expense,
                'profit' => $income - $expense,
            ];
        }

        return response()->json(['rows' => $rows]);
    }
}
