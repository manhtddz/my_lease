<?php

namespace App\Models;

use App\Enums\Code;
use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class Room extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'area_m2' => 'float',
        'default_rent' => 'integer',
    ];

    public function building()
    {
        return $this->belongsTo(Building::class);
    }

    public function meters()
    {
        return $this->hasMany(Meter::class);
    }

    public function contracts()
    {
        return $this->hasMany(Contract::class);
    }

    /** Hợp đồng đang hiệu lực — 1 phòng chỉ có tối đa 1 tại một thời điểm. */
    public function activeContract()
    {
        return $this->hasOne(Contract::class)->where('status', Code::CONTRACT_ACTIVE);
    }
}
