<?php

namespace Database\Seeders;

use App\Enums\Code;
use App\Models\Building;
use App\Models\Invoice;
use App\Models\Meter;
use App\Models\Room;
use App\Models\ServiceItem;
use App\Models\Setting;
use App\Services\BillingService;
use App\Services\MeterReadingService;
use App\Services\TenancyService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->masterData();
        $this->demoTenancy();
    }

    /** Dữ liệu gốc: 2 toà, 6 phòng, 12 đồng hồ, 7 khoản thu, cấu hình. */
    private function masterData(): void
    {
        $boarding = Building::create([
            'name' => 'Dãy trọ',
            'type' => Code::BUILDING_BOARDING,
            'address' => null,
        ]);

        $apartment = Building::create([
            'name' => 'Căn hộ',
            'type' => Code::BUILDING_APARTMENT,
            'address' => null,
        ]);

        foreach (['101', '102', '103', '104', '105'] as $code) {
            Room::create([
                'building_id' => $boarding->id,
                'code' => $code,
                'area_m2' => 20,
                'default_rent' => 2_000_000,
                'status' => Code::ROOM_VACANT,
            ]);
        }

        Room::create([
            'building_id' => $apartment->id,
            'code' => 'CH',
            'area_m2' => 55,
            'default_rent' => 5_000_000,
            'status' => Code::ROOM_VACANT,
        ]);

        // is_service = 0 cho 'rent': tiền phòng lấy từ contracts.rent_amount,
        // không bao giờ nằm trong contract_services.
        $items = [
            ['rent', 'Tiền phòng', Code::PRICE_FIXED, null, 'tháng', 0, false, 10],
            ['electric', 'Tiền điện', Code::PRICE_PER_UNIT, Code::METER_ELECTRIC, 'kWh', 3_500, true, 20],
            ['water', 'Tiền nước', Code::PRICE_PER_UNIT, Code::METER_WATER, 'm3', 15_000, true, 30],
            ['garbage', 'Tiền rác', Code::PRICE_FIXED, null, 'tháng', 20_000, true, 40],
            ['internet', 'Internet', Code::PRICE_FIXED, null, 'tháng', 0, true, 50],
            ['parking', 'Gửi xe', Code::PRICE_FIXED, null, 'xe', 0, true, 60],
            ['other', 'Khoản khác', Code::PRICE_FIXED, null, null, 0, true, 99],
        ];

        foreach ($items as [$code, $name, $mode, $meterType, $unit, $price, $isService, $sort]) {
            ServiceItem::create([
                'code' => $code,
                'name' => $name,
                'pricing_mode' => $mode,
                'meter_type' => $meterType,
                'unit_label' => $unit,
                'default_price' => $price,
                'is_service' => $isService,
                'is_active' => true,
                'sort_order' => $sort,
            ]);
        }

        // Mỗi phòng 1 đồng hồ điện + 1 đồng hồ nước.
        $installedAt = Carbon::today()->subYear()->toDateString();
        foreach (Room::all() as $room) {
            foreach ([Code::METER_ELECTRIC, Code::METER_WATER] as $type) {
                Meter::create([
                    'room_id' => $room->id,
                    'type' => $type,
                    'digits' => 5,
                    'initial_reading' => 0,
                    'installed_at' => $installedAt,
                    'is_active' => true,
                ]);
            }
        }

        $settings = [
            ['owner_name', null, 'Tên chủ trọ in trên hoá đơn'],
            ['owner_phone', null, 'SĐT liên hệ'],
            ['bank_account', null, 'Số tài khoản nhận chuyển khoản'],
            ['bank_name', null, 'Tên ngân hàng'],
            ['invoice_note', null, 'Ghi chú mặc định cuối hoá đơn'],
            ['due_days', '5', 'Số ngày sau ngày phát hành là hạn thanh toán'],
        ];

        foreach ($settings as [$key, $value, $note]) {
            Setting::create(['setting_key' => $key, 'setting_value' => $value, 'note' => $note]);
        }
    }

    /**
     * Dữ liệu demo: 4 phòng có khách từ 3 tháng trước, kèm lịch sử ghi số +
     * chốt sổ + thu tiền để dashboard và báo cáo có số liệu thật.
     *
     * Dùng đúng TenancyService / MeterReadingService / BillingService để dữ liệu
     * demo đi qua cùng đường với dữ liệu thật — không INSERT tắt.
     */
    private function demoTenancy(): void
    {
        /** @var TenancyService $tenancy */
        $tenancy = app(TenancyService::class);
        /** @var MeterReadingService $readingService */
        $readingService = app(MeterReadingService::class);
        /** @var BillingService $billing */
        $billing = app(BillingService::class);

        $electric = ServiceItem::where('code', 'electric')->first();
        $water = ServiceItem::where('code', 'water')->first();
        $garbage = ServiceItem::where('code', 'garbage')->first();
        $parking = ServiceItem::where('code', 'parking')->first();

        $start = Carbon::today()->subMonths(3)->startOfMonth();
        $startDate = $start->toDateString();

        // [phòng, tên, sđt, giá thuê, cọc, số người, chỉ số điện đầu, nước đầu, kWh/tháng, m3/tháng]
        $demo = [
            ['101', 'Nguyễn Văn An', '0901234567', 2_000_000, 2_000_000, 2, 1200, 40.0, 145, 3.2],
            ['102', 'Trần Thị Bình', '0912345678', 2_000_000, 2_000_000, 1, 950, 30.0, 62, 1.6],
            ['104', 'Lê Hoàng Cường', '0923456789', 2_100_000, 2_000_000, 2, 2050, 48.0, 118, 2.8],
            ['CH', 'Phạm Minh Dũng', '0934567890', 5_000_000, 5_000_000, 3, 3300, 115.0, 240, 9.5],
        ];

        foreach ($demo as [$roomCode, $name, $phone, $rent, $deposit, $people, $eStart, $wStart, , ]) {
            $room = Room::where('code', $roomCode)->first();
            $meters = Meter::where('room_id', $room->id)->orderBy('type')->get();

            // Đồng hồ đã chạy từ trước — đặt chỉ số gốc bằng chỉ số lúc khách vào
            // để đoạn "phòng trống" trước hợp đồng bằng 0, không sinh chi phí ảo.
            $meters[0]->update(['initial_reading' => $eStart, 'installed_at' => $startDate]);
            $meters[1]->update(['initial_reading' => $wStart, 'installed_at' => $startDate]);

            $services = [
                ['service_item_id' => $electric->id, 'unit_price' => $electric->default_price],
                ['service_item_id' => $water->id, 'unit_price' => $water->default_price],
                ['service_item_id' => $garbage->id, 'unit_price' => $garbage->default_price],
            ];

            if ($people > 1) {
                $services[] = [
                    'service_item_id' => $parking->id,
                    'unit_price' => 50_000,
                    'quantity_fixed' => $people - 1,
                ];
            }

            $tenancy->moveIn([
                'room_id' => $room->id,
                'tenant' => [
                    'full_name' => $name,
                    'phone' => $phone,
                    'gender' => Code::GENDER_MALE,
                ],
                'start_date' => $startDate,
                'rent_amount' => $rent,
                'deposit_amount' => $deposit,
                'occupant_count' => $people,
                'services' => $services,
                'meter_readings' => [
                    ['meter_id' => $meters[0]->id, 'reading' => $eStart],
                    ['meter_id' => $meters[1]->id, 'reading' => $wStart],
                ],
            ]);
        }

        // --- Lịch sử: ghi số + chốt sổ + thu tiền cho 2 kỳ đã qua ---
        $currentPeriod = Carbon::today()->format('Ym');
        $cursor = $start->copy();
        $monthIndex = 0;

        while ($cursor->format('Ym') < $currentPeriod) {
            $periodYm = $cursor->format('Ym');
            $readDate = $cursor->copy()->endOfMonth()->toDateString();
            $monthIndex++;

            foreach ($demo as [$roomCode, , , , , , $eStart, $wStart, $ePerMonth, $wPerMonth]) {
                $room = Room::where('code', $roomCode)->first();
                $meters = Meter::where('room_id', $room->id)->orderBy('type')->get();

                // Dao động nhẹ để số liệu trông thật và cảnh báo bất thường có đất diễn.
                $wobble = 1 + (($monthIndex % 3) - 1) * 0.08;

                $readingService->record(
                    meterId: $meters[0]->id,
                    reading: round($eStart + $ePerMonth * $monthIndex * $wobble),
                    readDate: $readDate,
                    reason: Code::READ_MONTHLY,
                    periodYm: $periodYm,
                );

                $readingService->record(
                    meterId: $meters[1]->id,
                    reading: round($wStart + $wPerMonth * $monthIndex * $wobble, 1),
                    readDate: $readDate,
                    reason: Code::READ_MONTHLY,
                    periodYm: $periodYm,
                );
            }

            $result = $billing->commit($periodYm);

            // Phát hành hết, và thu đủ trừ kỳ gần nhất để có công nợ demo.
            $isLatestClosed = $cursor->copy()->addMonth()->format('Ym') === $currentPeriod;

            foreach (Invoice::whereIn('id', $result['invoice_ids'])->get() as $index => $invoice) {
                $billing->issue($invoice);

                if ($isLatestClosed && $index === 1) {
                    // Một phòng trả thiếu → sinh carried_over cho kỳ sau.
                    $billing->recordPayment(
                        $invoice,
                        (int) round($invoice->total * 0.6),
                        $cursor->copy()->endOfMonth()->toDateString(),
                        Code::METHOD_CASH,
                    );

                    continue;
                }

                $billing->recordPayment(
                    $invoice,
                    $invoice->total,
                    $cursor->copy()->endOfMonth()->toDateString(),
                    $index % 2 === 0 ? Code::METHOD_CASH : Code::METHOD_TRANSFER,
                );
            }

            $cursor->addMonth();
        }
    }
}
