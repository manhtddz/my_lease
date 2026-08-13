<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class Tenant extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = ['dob' => 'date:Y-m-d'];

    public function contracts()
    {
        return $this->hasMany(Contract::class);
    }
}
