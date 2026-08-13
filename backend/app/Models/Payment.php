<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class Payment extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'paid_at' => 'date:Y-m-d',
        'amount' => 'integer',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }
}
