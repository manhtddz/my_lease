import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { date, money, moneyd, num, period } from '../lib/format'
import { Badge, ErrorBox, INVOICE_TONE, Spinner, useToast } from '../components/ui'
import { useConfirm } from '../components/confirm'
import PaymentModal from '../components/PaymentModal'
import { check, compact, notNegative, required } from '../lib/validate'

const STATUS_LABEL = { 1: 'Nháp', 2: 'Đã phát hành', 3: 'Trả một phần', 4: 'Đã trả đủ', 5: 'Đã huỷ' }
const METHOD_LABEL = { 1: 'Tiền mặt', 2: 'Chuyển khoản', 3: 'Khác' }
const KIND_LABEL = { 1: 'Tiền thuê / dịch vụ', 2: 'Thu cọc', 3: 'Hoàn cọc', 4: 'Khác' }

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftLines, setDraftLines] = useState([])
  const [draftDiscount, setDraftDiscount] = useState('0')
  const [editErrors, setEditErrors] = useState({})

  const { data, error, loading, reload } = useApi(() => api.invoice(id), [id])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const { invoice, details, payments, owner } = data
  const isDraft = invoice.status === '1'
  const isVoid = invoice.status === '5'

  function startEditing() {
    setDraftLines(details.map((d) => ({ id: d.id, quantity: String(d.quantity), unit_price: String(d.unit_price) })))
    setDraftDiscount(String(invoice.discount))
    setEditing(true)
  }

  function patchLine(lineId, key, value) {
    setDraftLines((lines) => lines.map((l) => (l.id === lineId ? { ...l, [key]: value } : l)))
  }

  const draftSubtotal = draftLines.reduce(
    (sum, l) => sum + Math.round((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)),
    0,
  )

  /** Kiểm tra từng ô số lượng / đơn giá trước khi gọi API. */
  function validateEdits() {
    const errors = {}

    draftLines.forEach((line) => {
      const qtyError = check('Số lượng', line.quantity, [required, notNegative])
      const priceError = check('Đơn giá', line.unit_price, [required, notNegative])
      if (qtyError) errors[`qty-${line.id}`] = qtyError
      if (priceError) errors[`price-${line.id}`] = priceError
    })

    const discountError = check('Giảm giá', draftDiscount, [required, notNegative])
    if (discountError) errors.discount = discountError
    if (!discountError && Number(draftDiscount) > draftSubtotal) {
      errors.discount = 'Giảm giá không được lớn hơn tổng tiền hàng'
    }

    const clean = compact(errors)
    setEditErrors(clean)
    return Object.keys(clean).length === 0
  }

  async function saveEdits() {
    if (!validateEdits()) {
      toast.error('Còn ô nhập chưa hợp lệ — kiểm tra lại các dòng bôi đỏ.')
      return
    }

    // Sửa số điện/nước ghi ngược vào sổ đồng hồ, nên nói rõ trước khi làm.
    const meteredChanges = draftLines
      .map((line) => {
        const original = details.find((d) => d.id === line.id)
        if (!original?.meter_reading_id) return null
        if (Math.abs(Number(line.quantity) - original.quantity) < 0.0001) return null
        return `${original.description.split(' (')[0]}: ${num(original.quantity)} → ${num(line.quantity)}`
      })
      .filter(Boolean)

    const newTotal = draftSubtotal - (Number(draftDiscount) || 0) + invoice.carried_over

    const agreed = await confirm({
      title: 'Lưu thay đổi hoá đơn?',
      message:
        `Tổng tiền đổi từ ${moneyd(invoice.total)} thành ${moneyd(newTotal)}.` +
        (meteredChanges.length ? '\n\nSố tiêu thụ sau sẽ được ghi ngược vào sổ đồng hồ:' : ''),
      details: meteredChanges.length ? meteredChanges : null,
      confirmLabel: 'Lưu thay đổi',
    })
    if (!agreed) return

    setBusy(true)
    try {
      const result = await api.updateInvoiceDetails(id, {
        details: draftLines.map((l) => ({
          id: l.id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
        })),
        discount: Number(draftDiscount) || 0,
      })

      const parts = ['Đã cập nhật hoá đơn.']
      if (result.synced.length) {
        parts.push(`Đã ghi ngược ${result.synced.length} chỉ số về sổ đồng hồ.`)
      }
      if (result.unsynced.length) {
        parts.push(`Không đồng bộ được sổ đồng hồ cho: ${result.unsynced.join(', ')} (dòng gộp nhiều lần đọc).`)
      }
      toast.success(parts.join('\n'))

      setEditing(false)
      setEditErrors({})
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function act(fn, successMessage) {
    setBusy(true)
    try {
      await fn()
      toast.success(successMessage)
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/invoices" className="text-sm text-sky-700 hover:underline">
            ← Danh sách hoá đơn
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900">
            {invoice.code}
            <Badge tone={INVOICE_TONE[invoice.status]}>{STATUS_LABEL[invoice.status]}</Badge>
            {invoice.is_settlement && <Badge tone="amber">Tất toán trả phòng</Badge>}
          </h1>
          <p className="text-sm text-slate-500">
            Phòng {invoice.room_code} · {invoice.tenant_name} · kỳ {period(invoice.period_ym)} (
            {date(invoice.period_from)} → {date(invoice.period_to)})
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={async () => {
                  const dirty = draftLines.some((line) => {
                    const original = details.find((d) => d.id === line.id)
                    return (
                      Number(line.quantity) !== original.quantity || Number(line.unit_price) !== original.unit_price
                    )
                  })
                  if (dirty) {
                    const agreed = await confirm({
                      title: 'Bỏ thay đổi?',
                      message: 'Các số bạn vừa sửa sẽ không được lưu.',
                      confirmLabel: 'Bỏ thay đổi',
                      tone: 'danger',
                    })
                    if (!agreed) return
                  }
                  setEditing(false)
                  setEditErrors({})
                }}
              >
                Huỷ sửa
              </button>
              <button className="btn-primary" onClick={saveEdits} disabled={busy}>
                {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </>
          ) : (
            invoice.editable && (
              <button className="btn-ghost" onClick={startEditing}>
                Sửa số liệu
              </button>
            )
          )}
          {isDraft && !editing && (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                const agreed = await confirm({
                  title: 'Phát hành hoá đơn?',
                  message: `Hoá đơn ${invoice.code} · ${moneyd(invoice.total)} sẽ chuyển sang trạng thái đã phát hành.`,
                  details: [
                    'Sau khi phát hành vẫn sửa được số liệu, cho tới khi thu tiền lần đầu.',
                    'Hoá đơn bắt đầu tính vào công nợ của khách.',
                  ],
                  confirmLabel: 'Phát hành',
                })
                if (agreed) act(() => api.issueInvoice(id), 'Đã phát hành.')
              }}
            >
              Phát hành
            </button>
          )}
          {!isDraft && !isVoid && !editing && invoice.remaining > 0 && (
            <button className="btn-primary" onClick={() => setPayOpen(true)}>
              Thu tiền
            </button>
          )}
          {!editing && (
            <button className="btn-ghost" onClick={() => window.print()}>
              In
            </button>
          )}
          {!isVoid && !editing && invoice.status !== '4' && (
            <button
              className="btn-danger"
              disabled={busy}
              onClick={async () => {
                const agreed = await confirm({
                  title: isDraft ? 'Xoá hoá đơn nháp?' : 'Huỷ hoá đơn đã phát hành?',
                  message: isDraft
                    ? `Hoá đơn nháp ${invoice.code} sẽ bị xoá.`
                    : `Hoá đơn ${invoice.code} · ${moneyd(invoice.total)} sẽ chuyển sang trạng thái đã huỷ.`,
                  details: isDraft
                    ? ['Chỉ số điện nước quay lại hàng chờ, chốt sổ lại được.']
                    : [
                        'Chỉ số điện nước quay lại hàng chờ để chốt sổ lại.',
                        'Bản ghi hoá đơn vẫn giữ để còn dấu vết, không xoá hẳn.',
                        'Chốt sổ lại sẽ sinh hoá đơn mã mới.',
                      ],
                  confirmLabel: isDraft ? 'Xoá nháp' : 'Huỷ hoá đơn',
                  tone: 'danger',
                })
                if (!agreed) return

                const reason = isDraft ? null : window.prompt('Lý do huỷ (ghi vào lịch sử hoá đơn):') || 'không ghi lý do'

                act(
                  async () => {
                    await api.deleteInvoice(id, reason)
                    if (isDraft) navigate('/invoices')
                  },
                  isDraft ? 'Đã xoá hoá đơn nháp.' : 'Đã huỷ hoá đơn, chỉ số trả về hàng chờ.',
                )
              }}
            >
              {isDraft ? 'Xoá nháp' : 'Huỷ hoá đơn'}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900">
          Đang sửa. Số lượng điện/nước bạn sửa ở đây sẽ được <b>ghi ngược về sổ đồng hồ</b> để hai nơi
          không lệch nhau — trừ dòng gộp nhiều lần đọc, khi đó phải sửa ở màn hình Ghi số.
        </div>
      )}

      {!editing && !invoice.editable && invoice.lock_reason && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          🔒 {invoice.lock_reason}
        </div>
      )}

      {!editing && invoice.editable && !isDraft && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          Đã phát hành nhưng chưa thu đồng nào — vẫn sửa được số liệu. Có tiền vào thì hoá đơn khoá lại.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-2 text-left">Khoản</th>
                <th className="px-4 py-2 text-right">SL</th>
                <th className="px-4 py-2 text-right">Đơn giá</th>
                <th className="px-4 py-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {details.map((d) => {
                const draft = draftLines.find((l) => l.id === d.id)

                if (!editing || !draft) {
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-2 text-slate-700">{d.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{num(d.quantity)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{money(d.unit_price)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{money(d.amount)}</td>
                    </tr>
                  )
                }

                const lineAmount = Math.round((Number(draft.quantity) || 0) * (Number(draft.unit_price) || 0))
                const changed = lineAmount !== d.amount

                return (
                  <tr key={d.id} className={changed ? 'bg-sky-50/60' : ''}>
                    <td className="px-4 py-2 text-slate-700">
                      {d.description}
                      {d.meter_reading_id && (
                        <div className="text-[11px] text-slate-400">gắn với chỉ số đồng hồ #{d.meter_reading_id}</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`num-input w-24 ${editErrors[`qty-${d.id}`] ? 'border-rose-400' : ''}`}
                        inputMode="decimal"
                        value={draft.quantity}
                        onChange={(e) => patchLine(d.id, 'quantity', e.target.value)}
                      />
                      {editErrors[`qty-${d.id}`] && (
                        <p className="mt-1 text-[11px] text-rose-600">{editErrors[`qty-${d.id}`]}</p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`num-input w-28 ${editErrors[`price-${d.id}`] ? 'border-rose-400' : ''}`}
                        inputMode="numeric"
                        value={draft.unit_price}
                        onChange={(e) => patchLine(d.id, 'unit_price', e.target.value)}
                      />
                      {editErrors[`price-${d.id}`] && (
                        <p className="mt-1 text-[11px] text-rose-600">{editErrors[`price-${d.id}`]}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {money(lineAmount)}
                      {changed && <div className="text-[11px] text-slate-400 line-through">{money(d.amount)}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-sm">
              <Row label="Cộng" value={editing ? draftSubtotal : invoice.subtotal} />
              {editing ? (
                <tr>
                  <td colSpan={3} className="px-4 py-1.5 text-right text-emerald-700">
                    Giảm giá
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`num-input w-28 ${editErrors.discount ? 'border-rose-400' : ''}`}
                      inputMode="numeric"
                      value={draftDiscount}
                      onChange={(e) => setDraftDiscount(e.target.value)}
                    />
                    {editErrors.discount && <p className="mt-1 text-[11px] text-rose-600">{editErrors.discount}</p>}
                  </td>
                </tr>
              ) : (
                invoice.discount > 0 && <Row label="Giảm giá" value={-invoice.discount} tone="text-emerald-700" />
              )}
              {invoice.carried_over > 0 && <Row label="Nợ kỳ trước" value={invoice.carried_over} tone="text-amber-700" />}
              <tr className="border-t border-slate-200">
                <td colSpan={3} className="px-4 py-2 text-right font-bold text-slate-700">
                  TỔNG
                </td>
                <td className="px-4 py-2 text-right text-base font-bold tabular-nums">
                  {moneyd(
                    editing
                      ? draftSubtotal - (Number(draftDiscount) || 0) + invoice.carried_over
                      : invoice.total,
                  )}
                </td>
              </tr>
              <Row label="Đã thu" value={invoice.paid_amount} tone="text-slate-500" />
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right font-bold text-slate-700">
                  CÒN LẠI
                </td>
                <td
                  className={`px-4 py-2 text-right text-base font-bold tabular-nums ${
                    invoice.remaining > 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {moneyd(invoice.remaining)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Lịch sử thu tiền</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có giao dịch.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0">
                    <div>
                      <div className="font-medium tabular-nums text-slate-800">{moneyd(p.amount)}</div>
                      <div className="text-xs text-slate-500">
                        {date(p.paid_at)} · {METHOD_LABEL[p.method]} · {KIND_LABEL[p.kind]}
                      </div>
                    </div>
                    <button
                      className="text-xs text-rose-600 hover:underline"
                      onClick={async () => {
                        const agreed = await confirm({
                          title: 'Xoá giao dịch thu tiền?',
                          message: `Giao dịch ${moneyd(p.amount)} ngày ${date(p.paid_at)} sẽ bị xoá.`,
                          details: [
                            'Công nợ của hoá đơn tăng trở lại tương ứng.',
                            'Dùng khi ghi nhầm số tiền, không dùng để hoàn tiền cho khách.',
                          ],
                          confirmLabel: 'Xoá giao dịch',
                          tone: 'danger',
                        })
                        if (agreed) act(() => api.deletePayment(p.id), 'Đã xoá giao dịch.')
                      }}
                    >
                      xoá
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(owner.bank_account || owner.name) && (
            <div className="card p-4 text-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Thông tin thanh toán</h3>
              {owner.name && <div>{owner.name}</div>}
              {owner.phone && <div className="text-slate-500">{owner.phone}</div>}
              {owner.bank_account && (
                <div className="mt-1 tabular-nums">
                  {owner.bank_name} · {owner.bank_account}
                </div>
              )}
              {owner.invoice_note && <p className="mt-2 text-xs text-slate-500">{owner.invoice_note}</p>}
            </div>
          )}
        </div>
      </div>

      <PaymentModal
        invoice={payOpen ? invoice : null}
        onClose={() => setPayOpen(false)}
        onSubmit={async (payload) => {
          await act(() => api.pay(id, payload), 'Đã ghi nhận thu tiền.')
          setPayOpen(false)
        }}
      />
    </div>
  )
}

function Row({ label, value, tone = '' }) {
  return (
    <tr>
      <td colSpan={3} className={`px-4 py-1.5 text-right ${tone || 'text-slate-500'}`}>
        {label}
      </td>
      <td className={`px-4 py-1.5 text-right tabular-nums ${tone}`}>{money(value)}</td>
    </tr>
  )
}

