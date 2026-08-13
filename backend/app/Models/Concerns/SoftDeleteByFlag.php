<?php

namespace App\Models\Concerns;

use App\Enums\Code;
use Illuminate\Database\Eloquent\Builder;

/**
 * Soft delete bằng cột `del_flag` thay cho `deleted_at`.
 *
 * Theo convention của lease-mart (config `deleted_flag.off/on`):
 *   del_flag = 0 → bản ghi còn sống
 *   del_flag = 1 → đã xoá
 *
 * Thay thế trait SoftDeletes của Laravel. Global scope tự lọc del_flag = 0,
 * nên mọi query thông thường không cần điều kiện gì thêm.
 *
 * LƯU Ý: unique index không biết tới del_flag. Xoá mềm một dòng rồi insert lại
 * cùng khoá sẽ đụng unique — dùng restore() thay vì tạo mới.
 */
trait SoftDeleteByFlag
{
    public static function bootSoftDeleteByFlag(): void
    {
        static::addGlobalScope('notDeleted', function (Builder $builder) {
            $builder->where($builder->getModel()->getTable().'.del_flag', Code::DEL_OFF);
        });
    }

    public function initializeSoftDeleteByFlag(): void
    {
        $this->casts['del_flag'] = 'integer';

        if (! in_array('del_flag', $this->hidden, true)) {
            $this->hidden[] = 'del_flag';
        }
    }

    /** Xoá mềm: bật cờ thay vì DELETE thật. */
    public function delete(): bool
    {
        if (! $this->exists) {
            return false;
        }

        $this->del_flag = Code::DEL_ON;

        return $this->save();
    }

    /** Xoá thật khỏi DB — chỉ dùng khi cố ý. */
    public function forceDelete(): bool
    {
        return (bool) static::withoutGlobalScope('notDeleted')
            ->whereKey($this->getKey())
            ->limit(1)
            ->getQuery()
            ->delete();
    }

    public function restore(): bool
    {
        $this->del_flag = Code::DEL_OFF;

        return $this->save();
    }

    public function trashed(): bool
    {
        return (int) $this->del_flag === Code::DEL_ON;
    }

    /** Bao gồm cả bản ghi đã xoá. */
    public function scopeWithTrashed(Builder $query): Builder
    {
        return $query->withoutGlobalScope('notDeleted');
    }

    /** Chỉ bản ghi đã xoá. */
    public function scopeOnlyTrashed(Builder $query): Builder
    {
        return $query->withoutGlobalScope('notDeleted')
            ->where($this->getTable().'.del_flag', Code::DEL_ON);
    }
}
