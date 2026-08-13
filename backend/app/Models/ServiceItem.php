<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class ServiceItem extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'default_price' => 'integer',
        'is_service' => 'boolean',
        'is_active' => 'boolean',
    ];
}
