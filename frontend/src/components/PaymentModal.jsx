import { useEffect, useState } from 'react'
import { Field, Modal } from './ui'
import { useConfirm } from './confirm'
import { moneyd, todayISO } from '../lib/format'
import { check, compact, positive, required } from '../lib/validate'

/**
 * Form thu tiền — dùng chung ở trang chi tiết hoá đơn và ở danh sách hoá đơn.
 *
 * `invoice` cần: { id, code, room_code, tenant_name, remaining }
 * Truyền `invoice = null` để đóng.
 */
export default function PaymentModal({ invoice, onClose, onSubmit }) {
  const confirm = useConfirm()
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(todayISO())
  const [method, setMethod] = useState('1')
  const [refNo, setRefNo] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // Mở hoá đơn nào thì prefill đúng số nợ của hoá đơn đó — trường hợp
  // thường gặp nhất là khách trả đủ.
  const invoiceId = invoice?.id
  const remaining = invoice?.remaining

  useEffect(() => {
    if (invoiceId !== undefined) {
      setAmount(String(remaining))
      setErrors({})
      setBusy(false)
    }
  }, [invoiceId, remaining])

  if (!invoice) return null

  function validate() {
    const clean = compact({
      amount: check('amount', amount, [required, positive]),
      paid_at: check('paid_at', paidAt, [required]),
      ref_no: method === '2' ? check('ref_no', refNo, [required]) : null,
    })
    setErrors(clean)
    return Object.keys(clean).length === 0
  }

  async function submit() {
    if (!validate()) return

    const value = Number(amount)

    // Thu quá số nợ thường là gõ sai — hỏi lại nhưng vẫn cho phép (khách trả trước).
    if (value > invoice.remaining) {
      const agreed = await confirm({
        title: 'Thu nhiều hơn số nợ?',
        message: `Số nợ còn ${moneyd(invoice.remaining)} nhưng bạn nhập ${moneyd(value)}, dư ${moneyd(value - invoice.remaining)}.`,
        details: ['Kiểm tra lại nếu chỉ định thu đủ.', 'Vẫn lưu được nếu khách trả trước cho kỳ sau.'],
        confirmLabel: 'Vẫn lưu',
      })
      if (!agreed) return
    }

    setBusy(true)
    await onSubmit({ amount: value, paid_at: paidAt, method, ref_no: refNo || null })
    setBusy(false)
  }

  return (
    <Modal open onClose={onClose} title="Ghi nhận thu tiền">
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium text-slate-800">
            {invoice.code}
            {invoice.room_code && <span className="text-slate-500"> · phòng {invoice.room_code}</span>}
          </div>
          {invoice.tenant_name && <div className="text-xs text-slate-500">{invoice.tenant_name}</div>}
        </div>

        <Field label={`Số tiền (còn nợ ${moneyd(invoice.remaining)})`} error={errors.amount}>
          <input
            className="field text-right tabular-nums"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày thu" error={errors.paid_at}>
            <input type="date" className="field" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Field label="Hình thức">
            <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="1">Tiền mặt</option>
              <option value="2">Chuyển khoản</option>
              <option value="3">Khác</option>
            </select>
          </Field>
        </div>

        {method === '2' && (
          <Field label="Mã giao dịch" error={errors.ref_no}>
            <input className="field" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
