import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { clampPeriod, date, money, moneyd, period } from '@/lib/format'
import { Badge, Empty, ErrorBox, Spinner, useToast } from '@/components/ui'
import { PeriodNav } from '@/components/PeriodNav'
import { useConfirm } from '@/components/confirm'
import PaymentModal from '@/components/PaymentModal'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_TONE,
  InvoiceStatus,
  type Invoice,
  type PaymentPayload,
} from '@/types'

export default function Invoices() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const confirm = useConfirm()
  // Hoá đơn đang mở form thu tiền — null là đóng.
  const [payTarget, setPayTarget] = useState<Invoice | null>(null)

  // Kỳ tương lai chắc chắn chưa có hoá đơn — kéo về kỳ hiện tại nếu URL trỏ tới đó.
  const rawPeriod = params.get('period') ?? ''
  const periodFilter = rawPeriod ? clampPeriod(rawPeriod) : ''
  const statusFilter = params.get('status') ?? ''
  const roomFilter = params.get('room_id') ?? ''

  const { data, error, loading, reload } = useApi(
    () =>
      api.invoices({
        period: periodFilter || undefined,
        status: statusFilter || undefined,
        room_id: roomFilter || undefined,
      }),
    [periodFilter, statusFilter, roomFilter],
  )

  const issueAllMut = useMutation((p: string) => api.issueAll(p), {
    success: (r) => `Đã phát hành ${r.issued} hoá đơn.`,
    onSuccess: () => reload(),
  })

  const issueOneMut = useMutation(
    async (invoice: Invoice) => {
      await api.issueInvoice(invoice.id)
      return invoice.code
    },
    { success: (code) => `Đã phát hành ${code}.`, onSuccess: () => reload() },
  )

  const payMut = useMutation(
    async (args: { invoice: Invoice; payload: PaymentPayload }) => {
      await api.pay(args.invoice.id, args.payload)
      return args
    },
    {
      success: ({ invoice, payload }) => `Đã thu ${moneyd(payload.amount)} cho ${invoice.code}.`,
      onSuccess: () => {
        setPayTarget(null)
        reload()
      },
    },
  )

  // Giữ hành vi cũ: đang phát hành hàng loạt thì khoá luôn nút phát hành từng dòng.
  const busy = issueAllMut.busy || issueOneMut.busy

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    setParams(next)
  }

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const rows = data.rows
  const drafts = rows.filter((r) => r.status === InvoiceStatus.Draft)
  const totalDue = rows.reduce((s, r) => s + Math.max(0, r.remaining), 0)

  async function issueAll() {
    if (!periodFilter) {
      toast.error('Chọn kỳ trước khi phát hành hàng loạt.')
      return
    }

    const agreed = await confirm({
      title: `Phát hành ${drafts.length} hoá đơn nháp?`,
      message: `Tổng ${moneyd(drafts.reduce((s, r) => s + r.total, 0))} sẽ chuyển sang trạng thái đã phát hành và tính vào công nợ.`,
      details: drafts.map((r) => `Phòng ${r.room_code} · ${r.tenant_name} · ${moneyd(r.total)}`),
      confirmLabel: 'Phát hành tất cả',
    })
    if (!agreed) return

    await issueAllMut.run(periodFilter)
  }

  async function issueOne(invoice: Invoice) {
    const agreed = await confirm({
      title: 'Phát hành hoá đơn?',
      message: `${invoice.code} · phòng ${invoice.room_code} · ${moneyd(invoice.total)}`,
      details: ['Vẫn sửa được số liệu cho tới khi thu tiền lần đầu.'],
      confirmLabel: 'Phát hành',
    })
    if (!agreed) return

    await issueOneMut.run(invoice)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Hoá đơn</h1>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Kỳ</label>
            <PeriodNav
              value={periodFilter || null}
              onChange={(p) => setFilter('period', p ?? '')}
              allowAll
            />
          </div>
          <div>
            <label className="label">Trạng thái</label>
            <select
              className="field w-40"
              value={statusFilter}
              onChange={(e) => setFilter('status', e.target.value)}
            >
              <option value="">Tất cả</option>
              {Object.entries(INVOICE_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {drafts.length > 0 && (
            <button className="btn-primary" onClick={issueAll} disabled={busy}>
              Phát hành {drafts.length} nháp
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
                    <Badge tone={INVOICE_TONE[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {/* Thu tiền là thao tác làm nhiều nhất — để ngay tại dòng, không phải vào chi tiết */}
                    {r.remaining > 0 && r.status !== InvoiceStatus.Draft && r.status !== InvoiceStatus.Void && (
                      <button className="btn-primary px-3 py-1 text-xs" onClick={() => setPayTarget(r)}>
                        Thu tiền
                      </button>
                    )}
                    {r.status === InvoiceStatus.Draft && (
                      <button
                        className="btn-ghost px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => issueOne(r)}
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
          if (!payTarget) return
          await payMut.run({ invoice: payTarget, payload })
        }}
      />
    </div>
  )
}
