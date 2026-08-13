<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BillingService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use RuntimeException;

class BillingController extends Controller
{
    public function __construct(private BillingService $service) {}

    /** Xem trước kỳ chốt sổ — không ghi DB. */
    public function preview(Request $request)
    {
        $periodYm = $request->query('period', Carbon::today()->format('Ym'));

        return response()->json($this->service->preview($periodYm));
    }

    /**
     * Chốt sổ thật. Idempotent: chạy lần hai chỉ tạo cho HĐ chưa có hoá đơn kỳ đó.
     *
     * Bỏ trống contract_ids / expense_room_ids = chốt cả kỳ.
     * Truyền vào = chốt lẻ từng phòng, để một phòng có vấn đề không chặn cả kỳ.
     */
    public function commit(Request $request)
    {
        $data = $request->validate([
            'period_ym' => ['required', 'string', 'size:6'],
            'contract_ids' => ['nullable', 'array'],
            'contract_ids.*' => ['integer'],
            'expense_room_ids' => ['nullable', 'array'],
            'expense_room_ids.*' => ['integer'],
        ]);

        try {
            return response()->json($this->service->commit(
                $data['period_ym'],
                $data['contract_ids'] ?? null,
                $data['expense_room_ids'] ?? null,
            ));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
