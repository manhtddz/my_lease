<?php

namespace App\Enums;

/**
 * Bảng mã CHAR(1) — xem docs/01-erd.md mục 7.
 *
 * Dùng hằng số thay vì PHP enum để giá trị lưu DB luôn là chuỗi '1'..'9',
 * khớp đúng với schema và với dữ liệu import từ ngoài.
 */
final class Code
{
    // del_flag — soft delete theo convention lease-mart (không dùng deleted_at)
    public const DEL_OFF = 0;   // còn sống
    public const DEL_ON = 1;    // đã xoá

    // buildings.type
    public const BUILDING_BOARDING = '1';   // dãy trọ
    public const BUILDING_APARTMENT = '2';  // căn hộ

    // rooms.status
    public const ROOM_VACANT = '1';
    public const ROOM_OCCUPIED = '2';
    public const ROOM_MAINTENANCE = '3';

    // tenants.gender
    public const GENDER_MALE = '1';
    public const GENDER_FEMALE = '2';
    public const GENDER_OTHER = '3';

    // contracts.status
    public const CONTRACT_DRAFT = '1';
    public const CONTRACT_ACTIVE = '2';
    public const CONTRACT_ENDED = '3';
    public const CONTRACT_CANCELLED = '4';

    // meters.type · service_items.meter_type
    public const METER_ELECTRIC = '1';
    public const METER_WATER = '2';

    // meter_readings.reason
    public const READ_MONTHLY = '1';
    public const READ_MOVE_IN = '2';
    public const READ_MOVE_OUT = '3';
    public const READ_METER_CHANGE = '4';
    public const READ_ADJUSTMENT = '5';

    // service_items.pricing_mode
    public const PRICE_FIXED = '1';
    public const PRICE_PER_UNIT = '2';
    public const PRICE_PER_PERSON = '3';
    public const PRICE_PER_DAY = '4';

    // invoices.status
    public const INVOICE_DRAFT = '1';
    public const INVOICE_ISSUED = '2';
    public const INVOICE_PARTIAL = '3';
    public const INVOICE_PAID = '4';
    public const INVOICE_VOID = '5';

    // payments.kind
    public const PAY_RENT = '1';
    public const PAY_DEPOSIT_IN = '2';
    public const PAY_DEPOSIT_REFUND = '3';
    public const PAY_OTHER = '4';

    // payments.method
    public const METHOD_CASH = '1';
    public const METHOD_TRANSFER = '2';
    public const METHOD_OTHER = '3';

    // expenses.category
    public const EXPENSE_UTILITY = '1';
    public const EXPENSE_REPAIR = '2';
    public const EXPENSE_TAX = '3';
    public const EXPENSE_EQUIPMENT = '4';
    public const EXPENSE_INTERNET = '5';
    public const EXPENSE_OTHER = '6';

    /** Nhãn tiếng Việt cho FE hiển thị — gom một chỗ để không lệch giữa các màn hình. */
    public static function labels(): array
    {
        return [
            'building_type' => [
                self::BUILDING_BOARDING => 'Dãy trọ',
                self::BUILDING_APARTMENT => 'Căn hộ',
            ],
            'room_status' => [
                self::ROOM_VACANT => 'Trống',
                self::ROOM_OCCUPIED => 'Đang thuê',
                self::ROOM_MAINTENANCE => 'Bảo trì',
            ],
            'gender' => [
                self::GENDER_MALE => 'Nam',
                self::GENDER_FEMALE => 'Nữ',
                self::GENDER_OTHER => 'Khác',
            ],
            'contract_status' => [
                self::CONTRACT_DRAFT => 'Nháp',
                self::CONTRACT_ACTIVE => 'Hiệu lực',
                self::CONTRACT_ENDED => 'Đã kết thúc',
                self::CONTRACT_CANCELLED => 'Đã huỷ',
            ],
            'meter_type' => [
                self::METER_ELECTRIC => 'Điện',
                self::METER_WATER => 'Nước',
            ],
            'read_reason' => [
                self::READ_MONTHLY => 'Định kỳ',
                self::READ_MOVE_IN => 'Khách vào',
                self::READ_MOVE_OUT => 'Khách ra',
                self::READ_METER_CHANGE => 'Thay đồng hồ',
                self::READ_ADJUSTMENT => 'Điều chỉnh',
            ],
            'pricing_mode' => [
                self::PRICE_FIXED => 'Cố định',
                self::PRICE_PER_UNIT => 'Theo chỉ số',
                self::PRICE_PER_PERSON => 'Theo đầu người',
                self::PRICE_PER_DAY => 'Theo ngày',
            ],
            'invoice_status' => [
                self::INVOICE_DRAFT => 'Nháp',
                self::INVOICE_ISSUED => 'Đã phát hành',
                self::INVOICE_PARTIAL => 'Trả một phần',
                self::INVOICE_PAID => 'Đã trả đủ',
                self::INVOICE_VOID => 'Đã huỷ',
            ],
            'payment_kind' => [
                self::PAY_RENT => 'Tiền thuê / dịch vụ',
                self::PAY_DEPOSIT_IN => 'Thu cọc',
                self::PAY_DEPOSIT_REFUND => 'Hoàn cọc',
                self::PAY_OTHER => 'Khác',
            ],
            'payment_method' => [
                self::METHOD_CASH => 'Tiền mặt',
                self::METHOD_TRANSFER => 'Chuyển khoản',
                self::METHOD_OTHER => 'Khác',
            ],
            'expense_category' => [
                self::EXPENSE_UTILITY => 'Hoá đơn tiện ích',
                self::EXPENSE_REPAIR => 'Sửa chữa',
                self::EXPENSE_TAX => 'Thuế',
                self::EXPENSE_EQUIPMENT => 'Thiết bị',
                self::EXPENSE_INTERNET => 'Internet',
                self::EXPENSE_OTHER => 'Khác',
            ],
        ];
    }
}
