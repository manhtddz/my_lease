<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class ContractOccupant extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'dob' => 'date:Y-m-d',
        'moved_in_at' => 'date:Y-m-d',
        'moved_out_at' => 'date:Y-m-d',
        'is_registered' => 'boolean',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }
}
