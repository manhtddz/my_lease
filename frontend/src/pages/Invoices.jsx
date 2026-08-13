import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { date, money, period } from '../lib/format'
import { Badge, Empty, ErrorBox, INVOICE_TONE, Spinner, useToast } from '../components/ui'
import { useConfirm } from '../components/confirm'
import PaymentModal from '../components/PaymentModal'
import { moneyd } from '../lib/format'

const STATUS_LABEL = { 1: 'Nháp', 2: 'Đã phát hành', 3: 'Trả một phần', 4: 'Đã trả đủ', 5: 'Đã huỷ' }

export default function Invoices() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  // Hoá đơn đang mở form thu tiền — null là đóng.
  const [payTarget, setPayTarget] = useState(null)

  const periodFilter = params.get('period') || ''
  const statusFilter = params.get('status') || ''
  const roomFilter = params.get('room_id') || ''

  const { data, error, loading, reload } = useApi(
    () =>
      api.invoices({
        period: periodFilter || undefined,
        status: statusFilter || undefined,
        room_id: roomFilter || undefined,
      }),
    [periodFilter, statusFilter, roomFilter],
  )

  function setFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    setParams(next)
  }

  async function issueAll() {
    if (!periodFilter) {
      toast.error('Chọn kỳ trước khi phát hành hàng loạt.')
      return
    }

    const draftRows = data.rows.filter((r) => r.status === '1')
    const agreed = await confirm({
      title: `Phát hành ${draftRows.length} hoá đơn nháp?`,
      message: `Tổng ${moneyd(draftRows.reduce((s, r) => s + r.total, 0))} sẽ chuyển sang trạng thái đã phát hành và tính vào công nợ.`,
      details: draftRows.map((r) => `Phòng ${r.room_code} · ${r.tenant_name} · ${moneyd(r.total)}`),
      confirmLabel: 'Phát hành tất cả',
    })
    if (!agreed) return

    setBusy(true)
    try {
      const result = await api.issueAll(periodFilter)
      toast.success(`Đã phát hành ${result.issued} hoá đơn.`)
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const rows = data.rows
  const drafts = rows.filter((r) => r.status === '1').length
  const totalDue = rows.reduce((s, r) => s + Math.max(0, r.remaining), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Hoá đơn</h1>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Kỳ</label>
            <input
              type="month"
              className="field w-40"
              value={periodFilter ? `${periodFilter.slice(0, 4)}-${periodFilter.slice(4, 6)}` : ''}
              onChange={(e) => setFilter('period', e.target.value.replace('-', ''))}
            />
          </div>
          <div>
            <label className="label">Trạng thái</label>
            <select className="field w-40" value={statusFilter} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {drafts > 0 && (
            <button className="btn-primary" onClick={issueAll} disabled={busy}>
              Phát hành {drafts} nháp
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty>Không có hoá đơn nào khớp bộ lọc.</Empty>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-3xl text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2 text-left">Mã</th>
                <th className="px-3 py-2 text-left">Kỳ</th>
                <th className="px-3 py-2 text-left">Phòng</th>
                <th className="px-3 py-2 text-left">Khách</th>
                <th className="px-3 py-2 text-right">Tổng</th>
                <th className="px-3 py-2 text-right">Đã thu</th>
                <th className="px-3 py-2 text-right">Còn lại</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link to={`/invoices/${r.id}`} className="font-medium text-sky-700 hover:underline">
                      {r.code}
                    </Link>
                    {r.is_settlement && (
                      <span className="ml-1">
                        <Badge tone="amber">tất toán</Badge>
                      </span>
                    )}
                    <div className="text-[11px] text-slate-400">Hạn {date(r.due_date)}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600">{period(r.period_ym)}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.room_code}</td>
                  <td className="px-3 py-2 text-slate-600">{r.tenant_name}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(r.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(r.paid_amount)}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.remaining > 0 ? 'text-rose-700' : 'text-slate-400'
                    }`}
                  >
                    {r.remaining > 0 ? money(r.remaining) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={INVOICE_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {/* Thu tiền là thao tác làm nhiều nhất — để ngay tại dòng, không phải vào chi tiết */}
                    {r.remaining > 0 && r.status !== '1' && r.status !== '5' && (
                      <button className="btn-primary px-3 py-1 text-xs" onClick={() => setPayTarget(r)}>
                        Thu tiền
                      </button>
                    )}
                    {r.status === '1' && (
                      <button
                        className="btn-ghost px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={async () => {
                          const agreed = await confirm({
                            title: 'Phát hành hoá đơn?',
                            message: `${r.code} · phòng ${r.room_code} · ${moneyd(r.total)}`,
                            details: ['Vẫn sửa được số liệu cho tới khi thu tiền lần đầu.'],
                            confirmLabel: 'Phát hành',
                          })
                          if (!agreed) return

                          setBusy(true)
                          try {
                            await api.issueInvoice(r.id)
                            toast.success(`Đã phát hành ${r.code}.`)
                            reload()
                          } catch (err) {
                            toast.error(err.message)
                          } finally {
                            setBusy(false)
                          }
                        }}
                      >
                        Phát hành
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-semibold">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-slate-600">
                  Tổng còn phải thu
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-700">{money(totalDue)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <PaymentModal
        invoice={payTarget}
        onClose={() => setPayTarget(null)}
        onSubmit={async (payload) => {
          try {
            await api.pay(payTarget.id, payload)
            toast.success(`Đã thu ${moneyd(payload.amount)} cho ${payTarget.code}.`)
            setPayTarget(null)
            reload()
          } catch (err) {
            toast.error(err.message)
          }
        }}
      />
    </div>
  )
}
