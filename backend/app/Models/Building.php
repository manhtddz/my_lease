<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class Building extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    public function rooms()
    {
        return $this->hasMany(Room::class);
    }
}
