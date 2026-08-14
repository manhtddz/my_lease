<?php

namespace App\Http\Controllers\Api;

use App\Enums\Code;
use App\Http\Controllers\Controller;
use App\Models\Meter;
use App\Models\MeterReading;
use App\Services\MeterReadingService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MeterReadingController extends Controller
{
    public function __construct(private MeterReadingService $service) {}

    /** Dữ liệu cho màn hình ghi số hàng loạt. */
    public function sheet(Request $request)
    {
        $periodYm = $request->query('period', Carbon::today()->format('Ym'));

        return response()->json([
            'period_ym' => $periodYm,
            'default_read_date' => min(Carbon::today()->toDateString(), $this->service->lastDayOf($periodYm)),
            'rows' => $this->service->entrySheet($periodYm),
        ]);
    }

    /** Lưu hàng loạt — cho lưu từng phần, ô trống thì bỏ qua. */
    public function storeBulk(Request $request)
    {
        $data = $request->validate([
            'period_ym' => ['required', 'string', 'size:6'],
            'read_date' => ['required', 'date'],
            'entries' => ['required', 'array'],
            'entries.*.meter_id' => ['required', 'integer'],
            'entries.*.reading' => ['nullable', 'numeric', 'min:0'],
            'entries.*.meter_changed' => ['nullable', 'boolean'],
            'entries.*.note' => ['nullable', 'string'],
        ]);

        $result = $this->service->storeMonthlyBulk(
            $data['entries'],
            $data['read_date'],
            $data['period_ym'],
        );

        if (! $result['errors']) {
            return response()->json($result);
        }

        // Gộp sẵn thành `message` — lỗi ở đây theo DÒNG chứ không theo field, nên
        // client không tự dựng câu từ mảng object được.
        //
        // Kèm vị trí (phòng + loại đồng hồ) vào từng dòng: lưu 12 ô một lượt mà
        // báo lỗi trống không thì không biết phải sửa ô nào.
        $meters = Meter::with('room')
            ->whereIn('id', array_column($result['errors'], 'meter_id'))
            ->get()
            ->keyBy('id');

        $lines = array_map(function (array $error) use ($meters) {
            $meter = $meters->get($error['meter_id']);

            $where = $meter
                ? trim($meter->room?->code.' '.($meter->type === Code::METER_ELECTRIC ? 'điện' : 'nước'))
                : "đồng hồ #{$error['meter_id']}";

            return "{$where}: {$error['message']}";
        }, $result['errors']);

        $result['message'] = ($result['saved'] > 0
            ? "Đã lưu {$result['saved']} chỉ số. Không lưu được ".count($lines)." dòng:\n"
            : '').implode("\n", $lines);

        return response()->json($result, 422);
    }

    public function index(Request $request)
    {
        $rows = MeterReading::with(['meter', 'room', 'contract.tenant'])
            ->when($request->query('room_id'), fn ($q, $v) => $q->where('room_id', $v))
            ->when($request->query('period'), fn ($q, $v) => $q->where('period_ym', $v))
            ->orderByDesc('read_date')
            ->orderBy('room_id')
            ->limit(200)
            ->get()
            ->map(fn (MeterReading $r) => [
                'id' => $r->id,
                'room_code' => $r->room->code,
                'meter_type' => $r->meter->type,
                'read_date' => $r->read_date->toDateString(),
                'prev_read_date' => $r->prev_read_date?->toDateString(),
                'prev_reading' => $r->prev_reading,
                'reading' => $r->reading,
                'consumption' => $r->consumption,
                'reason' => $r->reason,
                'period_ym' => $r->period_ym,
                'is_billed' => $r->is_billed,
                'charge_to' => $r->contract?->tenant?->full_name ?? '— phòng trống —',
                'note' => $r->note,
            ]);

        return response()->json(['rows' => $rows]);
    }

    /** Sửa chỉ số nhập sai — chỉ khi chưa tính tiền. */
    public function update(Request $request, MeterReading $meterReading)
    {
        if ($meterReading->is_billed) {
            return response()->json([
                'message' => 'Chỉ số đã được tính tiền. Huỷ hoá đơn liên quan trước khi sửa.',
            ], 422);
        }

        $data = $request->validate([
            'reading' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string'],
        ]);

        $consumption = $this->service->computeConsumption(
            $meterReading->meter,
            $meterReading->prev_reading,
            (float) $data['reading'],
        );

        $meterReading->update([
            'reading' => $data['reading'],
            'consumption' => $consumption,
            'note' => $data['note'] ?? $meterReading->note,
        ]);

        return response()->json($meterReading->refresh());
    }

    public function destroy(MeterReading $meterReading)
    {
        if ($meterReading->is_billed) {
            return response()->json([
                'message' => 'Chỉ số đã được tính tiền — không xoá được.',
            ], 422);
        }

        // Dòng sau trong chuỗi sẽ mất mắt xích; chặn để chuỗi không đứt.
        $hasNext = MeterReading::where('meter_id', $meterReading->meter_id)
            ->where('read_date', '>', $meterReading->read_date)
            ->exists();

        if ($hasNext) {
            return response()->json([
                'message' => 'Đã có lần đọc sau ngày này — xoá sẽ làm đứt chuỗi. Xoá dòng mới nhất trước.',
            ], 422);
        }

        $meterReading->delete();

        return response()->json(['deleted' => true]);
    }

    /** Hàng chờ: các đoạn tiêu thụ chưa tính tiền. */
    public function unbilled(Request $request)
    {
        $rows = $this->service->unbilled($request->query('room_id'))
            ->map(fn (MeterReading $r) => [
                'id' => $r->id,
                'room_id' => $r->room_id,
                'meter_type' => $r->meter->type,
                'read_date' => $r->read_date->toDateString(),
                'consumption' => $r->consumption,
                'contract_id' => $r->contract_id,
                'destination' => $r->contract_id === null ? 'expense' : 'invoice',
                'reason' => $r->reason,
            ]);

        return response()->json(['rows' => $rows]);
    }
}
