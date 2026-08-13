<?php

namespace App\Logging;

use Monolog\Logger;

/**
 * Factory cho channel `daily_folder` trong config/logging.php.
 */
class DailyFolderLogger
{
    public function __invoke(array $config): Logger
    {
        $logger = new Logger('daily_folder');

        return $logger->pushHandler(new DailyFolderHandler(
            $config['level'] ?? 'debug'
        ));
    }
}
