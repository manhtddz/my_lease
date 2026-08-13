<?php

namespace App\Http\Controllers\Api;

use App\Enums\Code;
use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\MeterReading;
use App\Models\Room;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $periodYm = $request->query('period', Carbon::today()->format('Ym'));

        $rooms = Room::with(['building', 'activeContract.tenant'])
            ->orderBy('building_id')
            ->orderBy('code')
            ->get()
            ->map(function (Room $room) use ($periodYm) {
                $contract = $room->activeContract;

                $debt = $contract
                    ? (int) Invoice::where('contract_id', $contract->id)
                        ->whereIn('status', [Code::INVOICE_ISSUED, Code::INVOICE_PARTIAL])
                        ->get()
                        ->sum(fn (Invoice $i) => max(0, $i->total - $i->paid_amount))
                    : 0;

                return [
                    'id' => $room->id,
                    'code' => $room->code,
                    'building_name' => $room->building->name,
                    'building_id' => $room->building_id,
                    'status' => $room->status,
                    'default_rent' => $room->default_rent,
                    'contract' => $contract ? [
                        'id' => $contract->id,
                        'code' => $contract->code,
                        'tenant_name' => $contract->tenant?->full_name,
                        'tenant_phone' => $contract->tenant?->phone,
                        'rent_amount' => $contract->rent_amount,
                        'start_date' => $contract->start_date->toDateString(),
                        'occupant_count' => $contract->occupant_count,
                    ] : null,
                    'debt' => $debt,
                    'has_reading_this_period' => MeterReading::where('room_id', $room->id)
                        ->where('period_ym', $periodYm)
                        ->exists(),
                ];
            });

        return response()->json([
            'period_ym' => $periodYm,
            'rooms' => $rooms,
            'banner' => $this->banner($periodYm),
            'summary' => $this->summary($periodYm),
        ]);
    }

    /**
     * Dải cảnh báo trên cùng — trái tim của UX dashboard.
     * Trạng thái kỳ quyết định hành động tiếp theo (docs/03-admin-flow.md mục 3).
     */
    private function banner(string $periodYm): array
    {
        // Kỳ trước bị bỏ quên có mức ưu tiên cao nhất.
        $prev = Carbon::createFromFormat('Ymd', $periodYm.'01')->subMonth()->format('Ym');
        $occupiedCount = Room::where('status', Code::ROOM_OCCUPIED)->count();
        $prevReadings = MeterReading::where('period_ym', $prev)->distinct('room_id')->count('room_id');

        if ($occupiedCount > 0 && $prevReadings === 0) {
            return [
                'level' => 'danger',
                'message' => "Kỳ {$this->human($prev)} chưa ghi số điện nước",
                'action' => 'read',
                'action_label' => 'GHI BÙ',
                'period' => $prev,
            ];
        }

        $readCount = MeterReading::where('period_ym', $periodYm)->count();
        if ($readCount === 0) {
            return [
                'level' => 'warning',
                'message' => "Chưa ghi số điện nước kỳ {$this->human($periodYm)}",
                'action' => 'read',
                'action_label' => 'GHI SỐ NGAY',
                'period' => $periodYm,
            ];
        }

        $unbilled = MeterReading::where('period_ym', $periodYm)->where('is_billed', false)->count();
        if ($unbilled > 0) {
            return [
                'level' => 'info',
                'message' => "Đã ghi số · còn {$unbilled} chỉ số chưa chốt sổ",
                'action' => 'billing',
                'action_label' => 'CHỐT SỔ',
                'period' => $periodYm,
            ];
        }

        $drafts = Invoice::where('period_ym', $periodYm)->where('status', Code::INVOICE_DRAFT)->count();
        if ($drafts > 0) {
            return [
                'level' => 'info',
                'message' => "{$drafts} hoá đơn nháp chờ phát hành",
                'action' => 'invoices',
                'action_label' => 'XEM & PHÁT HÀNH',
                'period' => $periodYm,
            ];
        }

        $issued = Invoice::where('period_ym', $periodYm)
            ->whereIn('status', [Code::INVOICE_ISSUED, Code::INVOICE_PARTIAL])->count();
        $paid = Invoice::where('period_ym', $periodYm)->where('status', Code::INVOICE_PAID)->count();

        if ($issued > 0) {
            $total = $issued + $paid;

            return [
                'level' => 'info',
                'message' => "{$paid}/{$total} hoá đơn đã thu đủ",
                'action' => 'invoices',
                'action_label' => 'XEM CÔNG NỢ',
                'period' => $periodYm,
            ];
        }

        return [
            'level' => 'success',
            'message' => "Kỳ {$this->human($periodYm)} đã xong",
            'action' => 'invoices',
            'action_label' => 'XEM HOÁ ĐƠN',
            'period' => $periodYm,
        ];
    }

    private function summary(string $periodYm): array
    {
        // Doanh thu = subtotal - discount. Không dùng total vì total đã cộng
        // carried_over (nợ kỳ trước) — sẽ tính doanh thu hai lần.
        $income = (int) Invoice::where('period_ym', $periodYm)
            ->where('status', '!=', Code::INVOICE_VOID)
            ->get()
            ->sum(fn (Invoice $i) => $i->subtotal - $i->discount);

        $expense = (int) Expense::where('period_ym', $periodYm)->sum('amount');

        $collected = (int) Invoice::where('period_ym', $periodYm)
            ->where('status', '!=', Code::INVOICE_VOID)
            ->sum('paid_amount');

        $outstanding = (int) Invoice::whereIn('status', [Code::INVOICE_ISSUED, Code::INVOICE_PARTIAL])
            ->get()
            ->sum(fn (Invoice $i) => max(0, $i->total - $i->paid_amount));

        return [
            'income' => $income,
            'expense' => $expense,
            'profit' => $income - $expense,
            'collected' => $collected,
            'outstanding' => $outstanding,
        ];
    }

    private function human(string $periodYm): string
    {
        return substr($periodYm, 4, 2).'/'.substr($periodYm, 0, 4);
    }
}
