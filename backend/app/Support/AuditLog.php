<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;

/**
 * Ghi vết các hành động chạm tới tiền.
 *
 * Vì sao cần: DB không có FK và hoá đơn sửa được khi chưa thu tiền, nên khi số liệu
 * lệch thì file log là nơi duy nhất trả lời được "ai đổi cái gì, lúc nào".
 *
 * Mỗi vùng một file trong thư mục ngày:
 *   storage/logs/2026-08-13/readings.log
 *   storage/logs/2026-08-13/billing.log
 *   storage/logs/2026-08-13/tenancy.log
 *   storage/logs/2026-08-13/api.log
 */
final class AuditLog
{
    public const READINGS = 'readings';   // ghi / sửa / xoá chỉ số đồng hồ
    public const BILLING = 'billing';     // chốt sổ, phát hành, huỷ, sửa hoá đơn, thu tiền
    public const TENANCY = 'tenancy';     // nhận khách, trả phòng
    public const API = 'api';             // truy vết request

    public static function info(string $area, string $message, array $context = []): void
    {
        self::write('info', $area, $message, $context);
    }

    public static function warning(string $area, string $message, array $context = []): void
    {
        self::write('warning', $area, $message, $context);
    }

    public static function error(string $area, string $message, array $context = []): void
    {
        self::write('error', $area, $message, $context);
    }

    private static function write(string $level, string $area, string $message, array $context): void
    {
        Log::channel('daily_folder')->{$level}($message, $context + ['path' => $area]);
    }
}
