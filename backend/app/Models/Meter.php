<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class Meter extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'initial_reading' => 'float',
        'installed_at' => 'date:Y-m-d',
        'removed_at' => 'date:Y-m-d',
        'is_active' => 'boolean',
    ];

    public function room()
    {
        return $this->belongsTo(Room::class);
    }

    public function readings()
    {
        return $this->hasMany(MeterReading::class);
    }

    /** Mắt xích cuối của chuỗi đọc — nguồn của prev_reading khi nhập số mới. */
    public function lastReading()
    {
        return $this->hasOne(MeterReading::class)->latest('read_date')->latest('id');
    }
}
