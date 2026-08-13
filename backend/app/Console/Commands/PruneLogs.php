<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Xoá các thư mục log cũ hơn N ngày.
 *
 * Log theo ngày sẽ tích tụ mãi nếu không dọn. Chạy tay mỗi vài tháng, hoặc
 * đưa vào Task Scheduler của Windows nếu muốn tự động.
 */
class PruneLogs extends Command
{
    protected $signature = 'logs:prune
                            {--days=90 : Giữ log trong bao nhiêu ngày}
                            {--dry-run : Chỉ liệt kê, không xoá}';

    protected $description = 'Xoá thư mục log cũ trong storage/logs';

    public function handle(): int
    {
        $days = (int) $this->option('days');
        $dryRun = (bool) $this->option('dry-run');

        if ($days < 1) {
            $this->error('--days phải lớn hơn 0.');

            return self::FAILURE;
        }

        $cutoff = Carbon::today()->subDays($days);
        $root = storage_path('logs');

        $deleted = 0;
        $freedBytes = 0;

        foreach (glob($root.'/*', GLOB_ONLYDIR) as $directory) {
            $name = basename($directory);

            // Chỉ đụng vào thư mục đúng dạng YYYY-MM-DD — tránh xoá thứ khác.
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $name)) {
                continue;
            }

            if (Carbon::parse($name)->greaterThanOrEqualTo($cutoff)) {
                continue;
            }

            $size = $this->directorySize($directory);
            $this->line(($dryRun ? '[thử] ' : '').'Xoá '.$name.' ('.$this->humanSize($size).')');

            if (! $dryRun) {
                $this->deleteDirectory($directory);
            }

            $deleted++;
            $freedBytes += $size;
        }

        if ($deleted === 0) {
            $this->info("Không có thư mục log nào cũ hơn {$days} ngày.");

            return self::SUCCESS;
        }

        $this->info(sprintf(
            '%s %d thư mục, %s.',
            $dryRun ? 'Sẽ xoá' : 'Đã xoá',
            $deleted,
            $this->humanSize($freedBytes)
        ));

        return self::SUCCESS;
    }

    private function directorySize(string $directory): int
    {
        $total = 0;
        foreach (glob($directory.'/*') as $file) {
            $total += is_dir($file) ? $this->directorySize($file) : filesize($file);
        }

        return $total;
    }

    private function deleteDirectory(string $directory): void
    {
        foreach (glob($directory.'/*') as $file) {
            is_dir($file) ? $this->deleteDirectory($file) : unlink($file);
        }

        rmdir($directory);
    }

    private function humanSize(int $bytes): string
    {
        if ($bytes >= 1_048_576) {
            return round($bytes / 1_048_576, 1).' MB';
        }
        if ($bytes >= 1024) {
            return round($bytes / 1024).' KB';
        }

        return $bytes.' B';
    }
}
