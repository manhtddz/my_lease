import { useState } from 'react'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { date, money, moneyd, todayISO } from '@/lib/format'
import { Empty, ErrorBox, Field, Modal, Spinner, useToast } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import { msg } from '@/lib/messages'
import { check, compact, dateNotFuture, hasErrors, positive, required, type Errors } from '@/lib/validate'
import { EXPENSE_CATEGORY_LABEL, ExpenseCategory, type Room } from '@/types'

export default function Expenses() {
  const toast = useToast()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const { data, error, loading, reload } = useApi(() => api.expenses(), [])
  const rooms = useApi(() => api.rooms(), [])

  const deleteMut = useMutation((expenseId: number) => api.deleteExpense(expenseId), {
    success: 'Đã xoá chi phí.',
    onSuccess: () => reload(),
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

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
                  <td className="px-3 py-2">{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                  <td className="px-3 py-2 text-slate-600">{e.note || e.vendor || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{e.room_code || e.building_name || 'chung'}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(e.amount)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                      disabled={deleteMut.busy}
                      onClick={async () => {
                        const agreed = await confirm({
                          title: 'Xoá chi phí này?',
                          message: `${EXPENSE_CATEGORY_LABEL[e.category]} · ${moneyd(e.amount)} · ngày ${date(e.spent_at)}`,
                          details: ['Báo cáo lời lỗ của kỳ tương ứng sẽ thay đổi theo.'],
                          confirmLabel: 'Xoá chi phí',
                          tone: 'danger',
                        })
                        if (!agreed) return

                        await deleteMut.run(e.id)
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

interface ExpenseForm {
  category: ExpenseCategory
  amount: string
  spent_at: string
  room_id: string
  vendor: string
  note: string
}

type ExpenseField = 'amount' | 'spent_at'

function ExpenseModal({
  open,
  onClose,
  onSaved,
  rooms,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  rooms: Room[]
}) {
  const toast = useToast()
  const [errors, setErrors] = useState<Errors<ExpenseField>>({})
  const [form, setForm] = useState<ExpenseForm>({
    category: ExpenseCategory.Utility,
    amount: '',
    spent_at: todayISO(),
    room_id: '',
    vendor: '',
    note: '',
  })

  function validate(): boolean {
    const clean = compact<ExpenseField>({
      amount: check('amount', form.amount, [required, positive]),
      spent_at: check('spent_at', form.spent_at, [required, dateNotFuture]),
    })
    setErrors(clean)

    if (hasErrors(clean)) {
      toast.error(msg('formInvalid'))
      return false
    }

    return true
  }

  // Thông báo thành công do parent lo trong onSaved — giữ nguyên hành vi cũ.
  const createMut = useMutation(
    (payload: Parameters<typeof api.createExpense>[0]) => api.createExpense(payload),
    { onSuccess: () => onSaved() },
  )

  async function submit() {
    if (!validate()) return

    await createMut.run({
      category: form.category,
      amount: Number(form.amount),
      spent_at: form.spent_at,
      room_id: form.room_id ? Number(form.room_id) : null,
      vendor: form.vendor || null,
      note: form.note || null,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm chi phí">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại">
            <select
              className="field"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            >
              {Object.entries(EXPENSE_CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ngày chi" error={errors.spent_at}>
            <input
              type="date"
              className="field"
              value={form.spent_at}
              onChange={(e) => setForm({ ...form, spent_at: e.target.value })}
            />
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
            <select
              className="field"
              value={form.room_id}
              onChange={(e) => setForm({ ...form, room_id: e.target.value })}
            >
              <option value="">— chung cả dãy —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nhà cung cấp">
            <input
              className="field"
              placeholder="EVN, thợ sửa…"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Ghi chú">
          <input
            className="field"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose} disabled={createMut.busy}>
            Huỷ
          </button>
          <button className="btn-primary" onClick={submit} disabled={createMut.busy}>
            {createMut.busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
