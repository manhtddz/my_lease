<?php

namespace App\Logging;

use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Route;
use Monolog\Formatter\LineFormatter;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Handler\StreamHandler;
use Monolog\Level;
use Monolog\Logger;
use Monolog\LogRecord;

/**
 * Ghi log vào thư mục theo NGÀY.
 *
 *   storage/logs/2026-08-13/error.log      <- MỌI lỗi, bất kể vùng nào
 *   storage/logs/2026-08-13/billing.log    <- luồng nghiệp vụ (context['path'])
 *   storage/logs/2026-08-13/readings.log
 *   storage/logs/2026-08-13/tenancy.log
 *   storage/logs/2026-08-13/api.log
 *   storage/logs/2026-08-13/app.info.log   <- log không khai vùng
 *
 * Theo convention của lease-mart (Core\Providers\Facades\Log\ChannelLoggingHandler),
 * rút gọn cho ứng dụng API một người dùng: bỏ phần Livewire và ChatWork.
 *
 * Lỗi được ghi VÀO CẢ HAI chỗ — file vùng và error.log — là cố ý:
 *   - đọc billing.log thấy trọn mạch nghiệp vụ, không bị khuyết chỗ thất bại
 *   - mở error.log là thấy ngay hôm nay hỏng những gì, không phải grep 5 file
 * Dòng trong error.log có tiền tố [vùng] để biết nó đến từ đâu.
 */
class DailyFolderHandler extends AbstractProcessingHandler
{
    private const DELIMITER = ' | ';

    /** Vùng mặc định khi không truyền context['path']. */
    private const DEFAULT_AREA = 'app';

    /** File gom mọi lỗi trong ngày. */
    private const ERROR_FILE = 'error.log';

    protected string $logFormatter = "%message% %context%\n";

    protected function write(LogRecord $record): void
    {
        $this->writeLog($record->level, $record->message, $record->context);
    }

    protected function writeLog(Level $level, string $message, array $context = []): void
    {
        $levelName = strtolower($level->name);
        $isError = $level->value >= Level::Error->value;

        // context['path'] tách log theo nghiệp vụ: billing, readings, tenancy…
        // Khi có path thì gộp mọi mức vào một file và ghi nhãn [inf]/[err] ở đầu dòng,
        // để đọc một luồng nghiệp vụ theo thứ tự thời gian mà không phải mở nhiều file.
        if (! empty($context['path'])) {
            $area = $context['path'];
            $fileName = $area.'.log';
            $label = '['.substr($levelName, 0, 3).']';
            unset($context['path']);
        } else {
            $area = self::DEFAULT_AREA;
            $fileName = $area.'.'.$levelName.'.log';
            $label = '';
        }

        $directory = $this->ensureDirectory();
        $requestInfo = $this->requestInfo($level);

        $prefix = '['.date('Y-m-d H:i:s').']'.($label ? ' '.$label : '');
        $this->append($directory.'/'.$fileName, $level, $prefix.' '.$message."\n".$requestInfo, $context);

        // Gom lỗi về một chỗ. Bỏ qua nếu file chính đã là error.log để không ghi đôi.
        if ($isError && $fileName !== self::ERROR_FILE) {
            $errorPrefix = '['.date('Y-m-d H:i:s').'] ['.$levelName.'] ['.$area.']';
            $this->append($directory.'/'.self::ERROR_FILE, $level, $errorPrefix.' '.$message."\n".$requestInfo, $context);
        }
    }

    private function append(string $path, Level $level, string $body, array $context): void
    {
        $handler = new StreamHandler($path, $level);
        $handler->setFormatter(new LineFormatter($this->logFormatter, 'Y-m-d H:i:s', true, true));

        $logger = new Logger('daily_folder');
        $logger->pushHandler($handler);
        $logger->log($level, $body, $context);
    }

    private function ensureDirectory(): string
    {
        $directory = storage_path('logs/'.date('Y-m-d'));

        if (! is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        return $directory;
    }

    /** Ngữ cảnh request — thiếu nó thì log lỗi gần như vô dụng khi truy nguyên nhân. */
    private function requestInfo(Level $level): string
    {
        $isConsole = App::runningInConsole();

        $parts = [
            'METHOD='.($isConsole ? 'CLI' : request()->method()),
            'URI='.($isConsole ? implode(' ', array_slice($_SERVER['argv'] ?? [], 1)) : request()->getRequestUri()),
            'ACTION='.($isConsole ? 'artisan' : (Route::currentRouteAction() ?: '-')),
            'IP='.($isConsole ? gethostbyname(php_uname('n')) : request()->ip()),
            'AGENT='.($isConsole ? php_uname('s').' '.php_uname('r') : (request()->userAgent() ?: '-')),
        ];

        // Lỗi thì thêm referer để biết người dùng đang ở màn hình nào.
        if ($level->value >= Level::Error->value && ! $isConsole) {
            $parts[] = 'REFERER='.(request()->headers->get('referer') ?: '-');
        }

        return '#Request: '.implode(self::DELIMITER, $parts);
    }
}
