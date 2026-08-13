<?php

namespace App\Models;

use App\Enums\Code;
use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SoftDeleteByFlag;

class Invoice extends Model
{
    use SoftDeleteByFlag;

    protected $guarded = ['id'];

    protected $casts = [
        'period_from' => 'date:Y-m-d',
        'period_to' => 'date:Y-m-d',
        'issue_date' => 'date:Y-m-d',
        'due_date' => 'date:Y-m-d',
        'subtotal' => 'integer',
        'discount' => 'integer',
        'carried_over' => 'integer',
        'total' => 'integer',
        'paid_amount' => 'integer',
        'is_settlement' => 'boolean',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function room()
    {
        return $this->belongsTo(Room::class);
    }

    public function details()
    {
        return $this->hasMany(InvoiceDetail::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function remaining(): int
    {
        return $this->total - $this->paid_amount;
    }

    /** Đã phát hành thì invoice_details bất biến — xem docs/02-schema.sql. */
    public function isLocked(): bool
    {
        return $this->status !== Code::INVOICE_DRAFT;
    }

    /**
     * Còn sửa được chi tiết không?
     *
     * Nới hơn isLocked(): hoá đơn đã phát hành nhưng CHƯA thu đồng nào vẫn sửa được,
     * vì chưa có tiền nào để bảo vệ. Có tiền vào rồi thì phải huỷ + điều chỉnh.
     */
    public function isEditable(): bool
    {
        return $this->paid_amount === 0
            && in_array($this->status, [Code::INVOICE_DRAFT, Code::INVOICE_ISSUED], true);
    }

    public function lockReason(): ?string
    {
        if ($this->isEditable()) {
            return null;
        }

        return match ($this->status) {
            Code::INVOICE_VOID => 'Hoá đơn đã huỷ.',
            Code::INVOICE_PAID => 'Hoá đơn đã thu đủ — huỷ và tạo hoá đơn điều chỉnh nếu cần sửa.',
            default => 'Hoá đơn đã thu '.number_format($this->paid_amount, 0, ',', '.')
                .'đ — xoá giao dịch thu tiền trước nếu muốn sửa.',
        };
    }
}
