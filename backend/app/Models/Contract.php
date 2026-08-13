<?php

namespace App\Models;

use App\Enums\Code;
use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class Contract extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'actual_end_date' => 'date:Y-m-d',
        'rent_amount' => 'integer',
        'deposit_amount' => 'integer',
        'occupant_count' => 'integer',
    ];

    public function room()
    {
        return $this->belongsTo(Room::class);
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function occupants()
    {
        return $this->hasMany(ContractOccupant::class);
    }

    public function services()
    {
        return $this->hasMany(ContractService::class);
    }

    public function invoices()
    {
        return $this->hasMany(Invoice::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    /** Ngày kết thúc hiệu lực: ưu tiên ngày trả phòng thực tế. */
    public function effectiveEndDate(): ?string
    {
        return $this->actual_end_date?->toDateString() ?? $this->end_date?->toDateString();
    }

    /** Cọc còn giữ = đã thu - đã hoàn. */
    public function depositHeld(): int
    {
        $refunded = (int) $this->payments()
            ->where('kind', Code::PAY_DEPOSIT_REFUND)
            ->sum('amount');

        return $this->deposit_amount - abs($refunded);
    }
}
