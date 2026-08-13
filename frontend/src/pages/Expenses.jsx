import { useState } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { date, money, moneyd, todayISO } from '../lib/format'
import { Empty, ErrorBox, Field, Modal, Spinner, useToast } from '../components/ui'
import { useConfirm } from '../components/confirm'
import { check, compact, dateNotFuture, positive, required } from '../lib/validate'

const CATEGORY = {
  1: 'Hoá đơn tiện ích',
  2: 'Sửa chữa',
  3: 'Thuế',
  4: 'Thiết bị',
  5: 'Internet',
  6: 'Khác',
}

export default function Expenses() {
  const toast = useToast()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const { data, error, loading, reload } = useApi(() => api.expenses(), [])
  const rooms = useApi(() => api.rooms(), [])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const total = data.rows.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Chi phí</h1>
          <p className="text-sm text-slate-500">
            Ghi hoá đơn EVN / nước tổng và tiền sửa chữa ở đây để biết lời lỗ thật.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Thêm chi phí
        </button>
      </div>

      {data.rows.length === 0 ? (
        <div className="card">
          <Empty>Chưa ghi chi phí nào.</Empty>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2 text-left">Ngày</th>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-left">Nội dung</th>
                <th className="px-3 py-2 text-left">Phòng</th>
                <th className="px-3 py-2 text-right">Số tiền</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 tabular-nums text-slate-600">{date(e.spent_at)}</td>
                  <td className="px-3 py-2">{CATEGORY[e.category]}</td>
                  <td className="px-3 py-2 text-slate-600">{e.note || e.vendor || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{e.room_code || e.building_name || 'chung'}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(e.amount)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-xs text-rose-600 hover:underline"
                      onClick={async () => {
                        const agreed = await confirm({
                          title: 'Xoá chi phí này?',
                          message: `${CATEGORY[e.category]} · ${moneyd(e.amount)} · ngày ${date(e.spent_at)}`,
                          details: ['Báo cáo lời lỗ của kỳ tương ứng sẽ thay đổi theo.'],
                          confirmLabel: 'Xoá chi phí',
                          tone: 'danger',
                        })
                        if (!agreed) return

                        try {
                          await api.deleteExpense(e.id)
                          toast.success('Đã xoá chi phí.')
                          reload()
                        } catch (err) {
                          toast.error(err.message)
                        }
                      }}
                    >
                      xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-slate-600">
                  Tổng
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ExpenseModal
        open={open}
        rooms={rooms.data?.rows ?? []}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          toast.success('Đã thêm chi phí.')
          reload()
        }}
      />
    </div>
  )
}

function ExpenseModal({ open, onClose, onSaved, rooms }) {
  const toast = useToast()
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    category: '1',
    amount: '',
    spent_at: todayISO(),
    room_id: '',
    vendor: '',
    note: '',
  })

  function validate() {
    const clean = compact({
      amount: check('Số tiền', form.amount, [required, positive]),
      spent_at: check('Ngày chi', form.spent_at, [required, dateNotFuture]),
    })
    setErrors(clean)
    return Object.keys(clean).length === 0
  }

  async function submit() {
    if (!validate()) return

    try {
      await api.createExpense({
        category: form.category,
        amount: Number(form.amount),
        spent_at: form.spent_at,
        room_id: form.room_id ? Number(form.room_id) : null,
        vendor: form.vendor || null,
        note: form.note || null,
      })
      onSaved()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm chi phí">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại">
            <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ngày chi" error={errors.spent_at}>
            <input type="date" className="field" value={form.spent_at} onChange={(e) => setForm({ ...form, spent_at: e.target.value })} />
          </Field>
        </div>
        <Field label="Số tiền" error={errors.amount} hint="Đơn vị đồng, không cần dấu phân cách">
          <input
            className="field text-right tabular-nums"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phòng (bỏ trống = chung)">
            <select className="field" value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
              <option value="">— chung cả dãy —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nhà cung cấp">
            <input className="field" placeholder="EVN, thợ sửa…" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <input className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" onClick={submit}>
            Lưu
          </button>
        </div>
      </div>
    </Modal>
  )
}
