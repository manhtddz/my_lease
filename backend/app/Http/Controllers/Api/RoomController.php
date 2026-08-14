<?php

namespace App\Http\Controllers\Api;

use App\Enums\Code;
use App\Http\Controllers\Controller;
use App\Models\Building;
use App\Models\Meter;
use App\Models\MeterReading;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * CRUD phòng.
 *
 * Hai luật xuyên suốt:
 *   - Trạng thái "đang thuê" do hợp đồng quyết định, không sửa tay được.
 *   - Tạo phòng phải tạo kèm đồng hồ điện + nước, nếu không màn Ghi số sẽ
 *     bỏ qua phòng đó và hoá đơn đầu tiên thiếu tiền điện nước.
 */
class RoomController extends Controller
{
    public function index()
    {
        return response()->json([
            'rows' => Room::with(['building', 'activeContract.tenant'])
                ->orderBy('building_id')
                ->orderBy('code')
                ->get()
                ->map(fn (Room $r) => $this->present($r)),
        ]);
    }

    public function buildings()
    {
        return response()->json([
            'rows' => Building::orderBy('name')->get()
                ->map(fn (Building $b) => [
                    'id' => $b->id,
                    'name' => $b->name,
                    'type' => $b->type,
                ]),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules(null));

        $room = DB::transaction(function () use ($data) {
            $room = Room::create([
                'building_id' => $data['building_id'],
                'code' => $data['code'],
                'area_m2' => $data['area_m2'] ?? null,
                'default_rent' => $data['default_rent'],
                'status' => $data['status'],
                'note' => $data['note'] ?? null,
            ]);

            $installedAt = $data['meter_installed_at'] ?? Carbon::today()->toDateString();

            // Chỉ số gốc mặc định 0 — phòng mới thì đồng hồ mới.
            foreach (
                [
                    [Code::METER_ELECTRIC, (float) ($data['electric_initial'] ?? 0)],
                    [Code::METER_WATER, (float) ($data['water_initial'] ?? 0)],
                ] as [$type, $initial]
            ) {
                Meter::create([
                    'room_id' => $room->id,
                    'type' => $type,
                    'digits' => 5,
                    'initial_reading' => $initial,
                    'installed_at' => $installedAt,
                    'is_active' => true,
                ]);
            }

            return $room;
        });

        return response()->json($this->present($room->refresh()->load('building')), 201);
    }

    public function update(Request $request, Room $room)
    {
        $data = $request->validate($this->rules($room));

        // Phòng đang có hợp đồng hiệu lực thì trạng thái phải là "đang thuê".
        // Cho sửa tay sẽ làm dashboard và màn Ghi số nói khác nhau về cùng một phòng.
        if ($room->activeContract && $data['status'] !== Code::ROOM_OCCUPIED) {
            return response()->json([
                'message' => 'Phòng đang có khách thuê nên phải giữ trạng thái Đang thuê. Trả phòng trước nếu muốn đổi.',
            ], 422);
        }

        if (! $room->activeContract && $data['status'] === Code::ROOM_OCCUPIED) {
            return response()->json([
                'message' => 'Không đặt trạng thái Đang thuê bằng tay — hãy tạo hợp đồng cho khách vào ở.',
            ], 422);
        }

        $room->update([
            'building_id' => $data['building_id'],
            'code' => $data['code'],
            'area_m2' => $data['area_m2'] ?? null,
            'default_rent' => $data['default_rent'],
            'status' => $data['status'],
            'note' => $data['note'] ?? null,
        ]);

        return response()->json($this->present($room->refresh()->load(['building', 'activeContract.tenant'])));
    }

    /**
     * Xoá mềm. Chặn khi còn khách hoặc khi đã phát sinh số liệu — xoá phòng đã
     * có lịch sử sẽ làm báo cáo cũ mất chỗ dựa. Bảo trì là lựa chọn đúng cho
     * phòng ngừng dùng.
     */
    public function destroy(Room $room)
    {
        if ($room->activeContract) {
            return response()->json([
                'message' => 'Phòng đang có khách thuê. Trả phòng trước khi xoá.',
            ], 422);
        }

        if ($room->contracts()->exists()) {
            return response()->json([
                'message' => 'Phòng đã từng có hợp đồng nên không xoá được — chuyển sang trạng thái Bảo trì để ngừng sử dụng.',
            ], 422);
        }

        $meterIds = Meter::where('room_id', $room->id)->pluck('id');

        if ($meterIds->isNotEmpty() && MeterReading::whereIn('meter_id', $meterIds)->exists()) {
            return response()->json([
                'message' => 'Phòng đã có chỉ số điện nước đã ghi nên không xoá được — chuyển sang trạng thái Bảo trì.',
            ], 422);
        }

        DB::transaction(function () use ($room, $meterIds) {
            Meter::whereIn('id', $meterIds)->get()->each->delete();
            $room->delete();
        });

        return response()->json(['deleted' => true]);
    }

    // ------------------------------------------------------------------ helper

    /** @return array<string, mixed> */
    private function rules(?Room $room): array
    {
        return [
            'building_id' => ['required', 'integer', Rule::exists('buildings', 'id')->where('del_flag', Code::DEL_OFF)],
            'code' => [
                'required', 'string', 'max:50',
                Rule::unique('rooms', 'code')
                    ->where(fn ($q) => $q->where('building_id', request('building_id'))->where('del_flag', Code::DEL_OFF))
                    ->ignore($room?->id),
            ],
            'area_m2' => ['nullable', 'numeric', 'min:0', 'max:9999'],
            'default_rent' => ['required', 'integer', 'min:0'],
            'status' => ['required', 'string', Rule::in([Code::ROOM_VACANT, Code::ROOM_OCCUPIED, Code::ROOM_MAINTENANCE])],
            'note' => ['nullable', 'string'],

            // Chỉ dùng khi tạo mới — đồng hồ của phòng sửa ở màn Ghi số.
            'electric_initial' => ['nullable', 'numeric', 'min:0'],
            'water_initial' => ['nullable', 'numeric', 'min:0'],
            'meter_installed_at' => ['nullable', 'date'],
        ];
    }

    /** @return array<string, mixed> */
    private function present(Room $room): array
    {
        $contract = $room->activeContract;

        return [
            'id' => $room->id,
            'code' => $room->code,
            'building_id' => $room->building_id,
            'building_name' => $room->building?->name,
            'status' => $room->status,
            'default_rent' => $room->default_rent,
            'area_m2' => $room->area_m2,
            'note' => $room->note,
            'tenant_name' => $contract?->tenant?->full_name,
            'contract_id' => $contract?->id,
            'meter_count' => Meter::where('room_id', $room->id)->count(),
        ];
    }
}
