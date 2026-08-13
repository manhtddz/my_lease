<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class MeterReading extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'read_date' => 'date:Y-m-d',
        'prev_read_date' => 'date:Y-m-d',
        'reading' => 'float',
        'prev_reading' => 'float',
        'consumption' => 'float',
        'is_estimated' => 'boolean',
        'is_billed' => 'boolean',
    ];

    public function meter()
    {
        return $this->belongsTo(Meter::class);
    }

    public function room()
    {
        return $this->belongsTo(Room::class);
    }

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }
}
