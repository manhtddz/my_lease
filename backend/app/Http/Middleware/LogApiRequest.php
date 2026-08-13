<?php

namespace App\Http\Middleware;

use App\Support\AuditLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ghi vết mọi request ghi dữ liệu vào storage/logs/{Y-m-d}/api.log.
 *
 * Chỉ log các method thay đổi dữ liệu (POST/PUT/PATCH/DELETE) — log cả GET thì
 * file phình lên vì dashboard tự gọi lại liên tục, mà GET không làm hỏng gì.
 */
class LogApiRequest
{
    private const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

    /** Không bao giờ ghi các field này ra log. */
    private const REDACT = ['password', 'password_confirmation', 'token', 'secret'];

    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);

        /** @var Response $response */
        $response = $next($request);

        if (! in_array($request->method(), self::MUTATING, true)) {
            return $response;
        }

        $duration = (int) round((microtime(true) - $startedAt) * 1000);
        $status = $response->getStatusCode();

        $message = sprintf(
            '%s %s → %d (%dms)',
            $request->method(),
            $request->path(),
            $status,
            $duration
        );

        $context = ['payload' => $this->safePayload($request)];

        // Lỗi 4xx/5xx kèm luôn lý do để không phải đoán vì sao request thất bại.
        if ($status >= 400) {
            $context['reason'] = $this->readableError($response->getContent());
            AuditLog::error(AuditLog::API, $message, $context);

            return $response;
        }

        AuditLog::info(AuditLog::API, $message, $context);

        return $response;
    }

    /**
     * Bóc lý do lỗi ra dạng người đọc được.
     *
     * Laravel trả JSON với unicode bị escape (`ỉ`), ghi thẳng vào log thì
     * tiếng Việt không đọc nổi. Decode rồi lấy đúng phần cần: message, hoặc
     * danh sách lỗi validate, hoặc lỗi từng dòng khi ghi số hàng loạt.
     */
    private function readableError(?string $content): string
    {
        if ($content === null || $content === '') {
            return '-';
        }

        $data = json_decode($content, true);

        if (! is_array($data)) {
            return mb_substr($content, 0, 500);
        }

        $messages = [];

        // Lỗi validate: {"errors": {"field": ["..."]}} — chi tiết hơn nên ưu tiên.
        if (! empty($data['errors']) && is_array($data['errors'])) {
            foreach ($data['errors'] as $key => $value) {
                // Ghi số hàng loạt trả {"errors": [{"meter_id": 1, "message": "..."}]}
                if (is_array($value) && isset($value['message'])) {
                    $messages[] = ($value['meter_id'] ?? $key).': '.$value['message'];

                    continue;
                }

                $messages[] = is_array($value) ? implode(' ', $value) : (string) $value;
            }
        }

        // `message` của Laravel chỉ là lỗi validate đầu tiên — thêm vào sẽ lặp.
        if (! $messages && ! empty($data['message'])) {
            $messages[] = $data['message'];
        }

        $messages = array_values(array_unique($messages));

        return $messages ? mb_substr(implode(' · ', $messages), 0, 800) : mb_substr($content, 0, 500);
    }

    private function safePayload(Request $request): array
    {
        $payload = $request->except(self::REDACT);

        // Ghi số hàng loạt gửi 12 dòng — rút gọn để log còn đọc được.
        if (isset($payload['entries']) && is_array($payload['entries'])) {
            $payload['entries'] = count($payload['entries']).' dòng';
        }

        return $payload;
    }
}
