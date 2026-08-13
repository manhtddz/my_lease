<?php

namespace App\Services;

use App\Enums\Code;
use App\Models\Contract;
use App\Models\Meter;
use App\Models\MeterReading;
use App\Models\Room;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Sinh và quản lý chuỗi chỉ số đồng hồ.
 *
 * Nguyên tắc (docs/03-admin-flow.md mục 1): meter_readings KHÔNG có form CRUD.
 * Mọi dòng đều sinh từ một sự kiện nghiệp vụ, và service tự suy ra
 * prev_reading / contract_id / consumption — người dùng chỉ nhập chỉ số mới.
 */
class MeterReadingService
{
    /**
     * Dữ liệu cho màn hình "Ghi số điện nước": mỗi phòng một dòng,
     * mỗi đồng hồ một ô nhập, kèm chỉ số cũ và cảnh báo.
     */
    public function entrySheet(string $periodYm): array
    {
        $rooms = Room::with(['building', 'meters' => fn ($q) => $q->where('is_active', true)->orderBy('type')])
            ->orderBy('building_id')
            ->orderBy('code')
            ->get();

        $rows = [];

        foreach ($rooms as $room) {
            $meters = [];

            foreach ($room->meters as $meter) {
                $last = $this->lastReadingBefore($meter->id);
                $existing = MeterReading::where('meter_id', $meter->id)
                    ->where('period_ym', $periodYm)
                    ->where('reason', Code::READ_MONTHLY)
                    ->first();

                $meters[] = [
                    'meter_id' => $meter->id,
                    'type' => $meter->type,
                    'digits' => $meter->digits,
                    'prev_reading' => $last?->reading ?? (float) $meter->initial_reading,
                    'prev_read_date' => $last?->read_date?->toDateString() ?? $meter->installed_at->toDateString(),
                    'prev_reading_id' => $last?->id,
                    'avg_consumption' => $this->averageConsumption($meter->id),
                    'existing' => $existing ? [
                        'id' => $existing->id,
                        'reading' => $existing->reading,
                        'consumption' => $existing->consumption,
                        'is_billed' => $existing->is_billed,
                        'read_date' => $existing->read_date->toDateString(),
                    ] : null,
                ];
            }

            // Ai chịu đoạn tiêu thụ này? Lấy mốc trước xa nhất trong các đồng hồ của phòng.
            $earliestPrev = collect($meters)->min('prev_read_date');
            $resolution = $this->resolveSegmentContract($room->id, $earliestPrev, $this->lastDayOf($periodYm));

            $rows[] = [
                'room_id' => $room->id,
                'room_code' => $room->code,
                'building_name' => $room->building->name,
                'room_status' => $room->status,
                'meters' => $meters,
                'contract_id' => $resolution['contract_id'],
                'charge_to' => $resolution['label'],
                'blocked' => $resolution['blocked'],
                'blocked_reason' => $resolution['reason'],
            ];
        }

        return $rows;
    }

    /**
     * Lưu hàng loạt chỉ số định kỳ. Cho lưu từng phần — ô trống thì bỏ qua.
     *
     * @param  array  $entries  [['meter_id' => int, 'reading' => float, 'note' => ?string, 'meter_changed' => bool], ...]
     * @return array{saved: int, skipped: int, errors: array}
     */
    public function storeMonthlyBulk(array $entries, string $readDate, string $periodYm): array
    {
        $saved = 0;
        $skipped = 0;
        $errors = [];

        DB::transaction(function () use ($entries, $readDate, $periodYm, &$saved, &$skipped, &$errors) {
            foreach ($entries as $entry) {
                if (! isset($entry['reading']) || $entry['reading'] === '' || $entry['reading'] === null) {
                    $skipped++;

                    continue;
                }

                try {
                    $this->record(
                        meterId: (int) $entry['meter_id'],
                        reading: (float) $entry['reading'],
                        readDate: $readDate,
                        reason: Code::READ_MONTHLY,
                        periodYm: $periodYm,
                        meterChanged: (bool) ($entry['meter_changed'] ?? false),
                        note: $entry['note'] ?? null,
                    );
                    $saved++;
                } catch (RuntimeException $e) {
                    $errors[] = ['meter_id' => $entry['meter_id'], 'message' => $e->getMessage()];
                }
            }
        });

        return ['saved' => $saved, 'skipped' => $skipped, 'errors' => $errors];
    }

    /**
     * Ghi một dòng chỉ số. Đây là cửa duy nhất vào bảng meter_readings.
     *
     * Tự suy ra: prev_reading, prev_read_date, prev_reading_id, consumption, contract_id.
     */
    public function record(
        int $meterId,
        float $reading,
        string $readDate,
        string $reason,
        string $periodYm,
        ?int $contractId = null,
        bool $contractIdGiven = false,
        bool $meterChanged = false,
        ?string $note = null,
        bool $isEstimated = false,
    ): MeterReading {
        $meter = Meter::findOrFail($meterId);

        // Ghi cùng ngày = CẬP NHẬT dòng đó, không phải thêm mắt xích mới.
        // Phải tìm cả bản ghi ĐÃ XOÁ MỀM: unique(meter_id, read_date) không biết
        // del_flag, nên insert mới sẽ vỡ constraint. Gặp dòng đã xoá thì hồi sinh nó.
        $sameDay = MeterReading::withTrashed()
            ->where('meter_id', $meterId)
            ->where('read_date', $readDate)
            ->first();

        if ($sameDay?->is_billed) {
            throw new RuntimeException(
                'Chỉ số ngày này đã được tính tiền — huỷ hoá đơn liên quan trước khi sửa.'
            );
        }

        // Mốc trước luôn là lần đọc TRƯỚC ngày này, không tính chính nó.
        $last = $this->lastReadingBefore($meterId, $readDate);

        $prevReading = $last?->reading ?? (float) $meter->initial_reading;
        $prevDate = $last?->read_date?->toDateString() ?? $meter->installed_at->toDateString();

        // Chèn vào giữa chuỗi sẽ làm prev_reading của dòng SAU nó sai. Chặn thay vì
        // tính lại cả chuỗi — với 6 phòng thì xoá dòng mới nhất rồi ghi lại là đủ.
        $laterExists = MeterReading::where('meter_id', $meterId)
            ->where('read_date', '>', $readDate)
            ->orderBy('read_date')
            ->first();

        if ($laterExists) {
            throw new RuntimeException(sprintf(
                'Đã có lần đọc ngày %s sau ngày %s. Ghi chèn vào giữa sẽ làm sai chuỗi chỉ số — '
                .'xoá dòng mới hơn trước, hoặc chọn ngày đọc muộn hơn.',
                $laterExists->read_date->toDateString(),
                $readDate
            ));
        }

        $consumption = $this->computeConsumption($meter, $prevReading, $reading, $meterChanged);

        // Gõ thiếu một chữ số (1730 -> 173) bị hiểu là đồng hồ quay vòng và cho ra
        // con số khổng lồ. Chặn ở đây vì FE có thể bị bỏ qua (import, API trực tiếp).
        if (! $meterChanged && $reading < $prevReading) {
            $average = $this->averageConsumption($meterId);

            if ($average !== null && $average > 0 && $consumption > $average * 10) {
                throw new RuntimeException(sprintf(
                    'Chỉ số %s nhỏ hơn số cũ %s. Nếu là quay vòng thật thì tiêu thụ sẽ là %s '
                    .'— gấp %.0f lần trung bình %s. Kiểm tra lại, hoặc tick "đã thay đồng hồ".',
                    rtrim(rtrim(number_format($reading, 2, ',', '.'), '0'), ','),
                    rtrim(rtrim(number_format($prevReading, 2, ',', '.'), '0'), ','),
                    rtrim(rtrim(number_format($consumption, 2, ',', '.'), '0'), ','),
                    $consumption / $average,
                    rtrim(rtrim(number_format($average, 2, ',', '.'), '0'), ',')
                ));
            }
        }

        if (! $contractIdGiven) {
            $resolution = $this->resolveSegmentContract($meter->room_id, $prevDate, $readDate);
            if ($resolution['blocked']) {
                throw new RuntimeException($resolution['reason']);
            }
            $contractId = $resolution['contract_id'];
        }

        $payload = [
            'meter_id' => $meterId,
            'room_id' => $meter->room_id,
            'read_date' => $readDate,
            'reading' => $reading,
            'prev_reading_id' => $last?->id,
            'prev_reading' => $prevReading,
            'prev_read_date' => $prevDate,
            'consumption' => $consumption,
            'contract_id' => $contractId,
            'reason' => $reason,
            'period_ym' => $periodYm,
            'is_estimated' => $isEstimated,
            'note' => $note,
        ];

        if ($sameDay) {
            $sameDay->fill($payload);
            $sameDay->del_flag = Code::DEL_OFF;   // hồi sinh nếu trước đó đã xoá mềm
            $sameDay->is_billed = false;
            $sameDay->save();

            return $sameDay->refresh();
        }

        return MeterReading::create($payload + ['is_billed' => false]);
    }

    /**
     * Tiêu thụ = hiệu 2 chỉ số, có xử lý quay vòng đồng hồ và thay đồng hồ.
     * Kết quả được LƯU TRỰC TIẾP vào cột consumption, không phải computed column.
     */
    public function computeConsumption(Meter $meter, float $prev, float $curr, bool $meterChanged = false): float
    {
        if ($meterChanged) {
            // Đồng hồ mới bắt đầu từ 0 (hoặc số nhỏ) — phần tiêu thụ chỉ là chỉ số mới.
            return max(0, $curr);
        }

        if ($curr >= $prev) {
            return round($curr - $prev, 2);
        }

        // Quay vòng: 99999 -> 00012
        $ceiling = 10 ** $meter->digits;

        return round(($ceiling - $prev) + $curr, 2);
    }

    /**
     * Hợp đồng nào chịu đoạn tiêu thụ (prevDate -> readDate]?
     *
     * - 0 hợp đồng  → NULL, phòng trống, chủ chịu (ghi vào expenses)
     * - 1 hợp đồng  → tính cho hợp đồng đó
     * - >1 hợp đồng → CHẶN, phải dùng wizard trả phòng / nhận khách
     *
     * @return array{contract_id: ?int, label: string, blocked: bool, reason: ?string}
     */
    public function resolveSegmentContract(int $roomId, ?string $prevDate, string $readDate): array
    {
        $from = $prevDate ?? $readDate;

        $candidates = Contract::with('tenant')
            ->where('room_id', $roomId)
            ->whereIn('status', [Code::CONTRACT_ACTIVE, Code::CONTRACT_ENDED])
            ->where('start_date', '<=', $readDate)
            ->get()
            ->filter(function (Contract $c) use ($from) {
                $end = $c->effectiveEndDate();

                return $end === null || $end >= $from;
            })
            ->values();

        if ($candidates->isEmpty()) {
            return [
                'contract_id' => null,
                'label' => '— trống —',
                'blocked' => false,
                'reason' => null,
            ];
        }

        if ($candidates->count() > 1) {
            $names = $candidates->map(fn ($c) => $c->tenant?->full_name ?? "HĐ #{$c->id}")->implode(' → ');

            return [
                'contract_id' => null,
                'label' => $names,
                'blocked' => true,
                'reason' => "Phòng đổi khách trong khoảng {$from} → {$readDate} ({$names}). "
                    .'Dùng wizard trả phòng / nhận khách thay vì ghi số hàng loạt.',
            ];
        }

        $contract = $candidates->first();

        return [
            'contract_id' => $contract->id,
            'label' => $contract->tenant?->full_name ?? "HĐ #{$contract->id}",
            'blocked' => false,
            'reason' => null,
        ];
    }

    /** Mắt xích cuối của chuỗi đọc cho một đồng hồ. */
    public function lastReadingBefore(int $meterId, ?string $beforeDate = null): ?MeterReading
    {
        return MeterReading::where('meter_id', $meterId)
            ->when($beforeDate, fn ($q) => $q->where('read_date', '<', $beforeDate))
            ->orderByDesc('read_date')
            ->orderByDesc('id')
            ->first();
    }

    /** Trung bình tiêu thụ 6 kỳ gần nhất — dùng để cảnh báo số bất thường. */
    public function averageConsumption(int $meterId, int $periods = 6): ?float
    {
        $values = MeterReading::where('meter_id', $meterId)
            ->orderByDesc('read_date')
            ->limit($periods)
            ->pluck('consumption');

        return $values->isEmpty() ? null : round($values->avg(), 2);
    }

    /** Các đoạn tiêu thụ chưa tính tiền — hàng chờ khi chốt sổ. */
    public function unbilled(?int $roomId = null): Collection
    {
        return MeterReading::with('meter')
            ->where('is_billed', false)
            ->when($roomId, fn ($q) => $q->where('room_id', $roomId))
            ->orderBy('room_id')
            ->orderBy('read_date')
            ->get();
    }

    public function lastDayOf(string $periodYm): string
    {
        return Carbon::createFromFormat('Ymd', $periodYm.'01')->endOfMonth()->toDateString();
    }

    public function firstDayOf(string $periodYm): string
    {
        return Carbon::createFromFormat('Ymd', $periodYm.'01')->toDateString();
    }
}
