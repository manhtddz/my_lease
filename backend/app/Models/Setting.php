<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $primaryKey = 'setting_key';

    public $incrementing = false;

    protected $keyType = 'string';

    public const CREATED_AT = null;

    protected $guarded = [];

    public static function get(string $key, mixed $default = null): mixed
    {
        return static::find($key)?->setting_value ?? $default;
    }
}
