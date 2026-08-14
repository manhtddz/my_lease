import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { clampPeriod, currentPeriod, date, money, moneyd, num, period } from '@/lib/format'
import { ErrorBox, Spinner } from '@/components/ui'
import { PeriodNav } from '@/components/PeriodNav'
import { useConfirm } from '@/components/confirm'
import type { InvoiceDraft, PeriodYm } from '@/types'

/** Nút nào đang chạy: 'all' cả kỳ · 'exp' khối chi phí · số = contract_id. */
type BusyKey = 'all' | 'exp' | number | null

/**
 * Chốt sổ — nút không tạo hoá đơn ngay mà mở trang xem trước.
 * Ba việc bắt buộc: nói rõ cái gì bị bỏ qua · tách riêng phần vào chi phí ·
 * idempotent (chạy lần hai không sinh hoá đơn kép).
 */
export default function Billing() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [viewPeriod, setViewPeriod] = useState<PeriodYm>(() => {
    const fromUrl = params.get('period')
    return fromUrl ? clampPeriod(fromUrl) : currentPeriod()
  })
  // Chốt lẻ chạy chung một hook nên cần nhớ riêng phòng nào đang chạy để hiện "Đang tạo…" đúng dòng.
  const [pendingContractId, setPendingContractId] = useState<number | null>(null)

  const { data, error, loading, reload } = useApi(() => api.billingPreview(viewPeriod), [viewPeriod])

  const commitAllMut = useMutation((p: PeriodYm) => api.billingCommit(p), {
    success: (r) =>
      `Đã tạo ${r.invoice_count} hoá đơn nháp` +
      (r.expense_count ? ` và ${r.expense_count} dòng chi phí.` : '.'),
    onSuccess: () => navigate(`/invoices?period=${viewPeriod}`),
  })

  const commitOneMut = useMutation(
    async (draft: InvoiceDraft) => {
      await api.billingCommit(viewPeriod, [draft.contract_id])
      return draft.room_code
    },
    { success: (code) => `Đã tạo hoá đơn nháp phòng ${code}.`, onSuccess: () => reload() },
  )

  const commitExpensesMut = useMutation(
    (roomIds: Parameters<typeof api.billingCommit>[2]) =>
      api.billingCommit(viewPeriod, [], roomIds),
    { success: (r) => `Đã ghi ${r.expense_count} dòng chi phí.`, onSuccess: () => reload() },
  )

  const busyKey: BusyKey = commitAllMut.busy
    ? 'all'
    : commitExpensesMut.busy
      ? 'exp'
      : commitOneMut.busy
        ? pendingContractId
        : null

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const { invoices, owner_expenses: expenses, warnings } = data
  const nothingToDo = invoices.length === 0 && expenses.length === 0

  /** Chốt cả kỳ — xong thì sang danh sách hoá đơn. */
  async function commitAll() {
    if (!data) return

    const warningMessages = data.warnings.map((w) => w.message)

    const agreed = await confirm({
      title: `Chốt sổ cả kỳ ${period(viewPeriod)}?`,
      message:
        `Sẽ tạo ${data.invoices.length} hoá đơn nháp` +
        (data.owner_expenses.length ? ` và ${data.owner_expenses.length} dòng chi phí` : '') +
        `, tổng ${moneyd(data.total)}.` +
        (warningMessages.length ? '\n\nLưu ý trước khi chốt:' : ''),
      details: warningMessages.length
        ? warningMessages
        : ['Chỉ số điện nước sẽ được đánh dấu đã tính tiền.'],
      confirmLabel: 'Chốt cả kỳ',
    })
    if (!agreed) return

    await commitAllMut.run(viewPeriod)
  }

  /**
   * Chốt lẻ — ở lại trang để làm tiếp phòng khác.
   * Phòng vừa chốt sẽ biến mất khỏi danh sách xem trước, đó là phản hồi.
   */
  async function commitOne(draft: InvoiceDraft) {
    const agreed = await confirm({
      title: `Tạo hoá đơn phòng ${draft.room_code}?`,
      message: `${draft.tenant_name} · ${moneyd(draft.total)} · ${date(draft.period_from)} → ${date(draft.period_to)}`,
      details: [
        `${draft.details.length} dòng: ${draft.details.map((d) => d.description.split(' ')[1] ?? d.description).join(', ')}`,
        'Chỉ số điện nước của phòng này sẽ được đánh dấu đã tính tiền.',
        'Các phòng khác không bị ảnh hưởng.',
      ],
      confirmLabel: 'Tạo hoá đơn nháp',
    })
    if (!agreed) return

    setPendingContractId(draft.contract_id)
    await commitOneMut.run(draft)
    setPendingContractId(null)
  }

  async function commitExpenses() {
    if (!data) return

    const total = data.owner_expenses.reduce((sum, e) => sum + e.amount, 0)

    const agreed = await confirm({
      title: 'Ghi các đoạn phòng trống vào chi phí?',
      message: `${data.owner_expenses.length} dòng · ${moneyd(total)} sẽ được ghi là chi phí của bạn, không tính cho khách nào.`,
      details: data.owner_expenses.map((e) => e.description),
      confirmLabel: 'Ghi vào chi phí',
    })
    if (!agreed) return

    await commitExpensesMut.run(data.owner_expenses.map((e) => e.room_id))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Chốt sổ kỳ {period(viewPeriod)}</h1>
          <p className="text-sm text-slate-500">
            {date(data.period_from)} → {date(data.period_to)}
          </p>
        </div>
        <PeriodNav value={viewPeriod} onChange={(p) => p && setViewPeriod(p)} />
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`rounded-lg border px-4 py-2.5 text-sm ${
                w.level === 'danger'
                  ? 'border-rose-300 bg-rose-50 text-rose-900'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              ⚠ {w.message}
            </div>
          ))}
        </div>
      )}

      {nothingToDo ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          Không có gì để chốt cho kỳ này.
          <div className="mt-1 text-xs text-slate-400">
            Hoặc kỳ đã chốt rồi, hoặc chưa ghi số điện nước.
          </div>
        </div>
      ) : (
        <>
          {invoices.map((draft) => (
            <div key={draft.contract_id} className="card overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="font-semibold text-slate-800">
                  Phòng {draft.room_code} · {draft.tenant_name}
                </div>
                <div className="text-xs text-slate-500">
                  {date(draft.period_from)} → {date(draft.period_to)}
                </div>
              </div>

              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {draft.details.map((line, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-700">{line.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        {num(line.quantity)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        × {money(line.unit_price)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-800">
                        {money(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/70 text-sm">
                  <tr>
                    <td colSpan={3} className="px-4 py-1.5 text-right text-slate-500">
                      Cộng
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{money(draft.subtotal)}</td>
                  </tr>
                  {draft.carried_over > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-1.5 text-right text-amber-700">
                        Nợ kỳ trước
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-amber-700">
                        {money(draft.carried_over)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right font-bold text-slate-700">
                      TỔNG
                    </td>
                    <td className="px-4 py-2 text-right text-base font-bold tabular-nums text-slate-900">
                      {moneyd(draft.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-4 py-2">
                <button
                  className="btn-ghost px-3 py-1.5 text-xs"
                  disabled={busyKey !== null}
                  onClick={() => commitOne(draft)}
                >
                  {busyKey === draft.contract_id
                    ? 'Đang tạo…'
                    : `Tạo hoá đơn nháp phòng ${draft.room_code}`}
                </button>
              </div>
            </div>
          ))}

          {expenses.length > 0 && (
            <div className="card overflow-hidden border-slate-300">
              <div className="border-b border-slate-100 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">
                📌 Ghi vào CHI PHÍ — không tính cho khách
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((e, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-700">{e.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        {num(e.quantity)} × {money(e.unit_price)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-800">
                        {money(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-4 py-2">
                <button
                  className="btn-ghost px-3 py-1.5 text-xs"
                  disabled={busyKey !== null}
                  onClick={commitExpenses}
                >
                  {busyKey === 'exp' ? 'Đang ghi…' : 'Ghi vào chi phí'}
                </button>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="text-sm">
              Còn <b>{invoices.length}</b> hoá đơn chưa chốt ·{' '}
              <span className="text-lg font-bold tabular-nums text-slate-900">{moneyd(data.total)}</span>
            </div>
            <button
              className="btn-primary"
              onClick={commitAll}
              disabled={busyKey !== null || invoices.length === 0}
            >
              {busyKey === 'all' ? 'Đang tạo…' : `TẠO TẤT CẢ ${invoices.length} HOÁ ĐƠN`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
