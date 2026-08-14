import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { date, money, moneyd, num, todayISO } from '@/lib/format'
import { ErrorBox, Field, Spinner, useToast } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import { msg } from '@/lib/messages'
import {
  check,
  compact,
  dateAfter,
  hasErrors,
  max,
  notLessThan,
  notNegative,
  required,
} from '@/lib/validate'
import { METER_UNIT, MeterType, type MeterSnapshot } from '@/types'

/** Chỉ số đang nhập cho một đồng hồ. */
interface ReadingInput extends MeterSnapshot {
  reading: string
}

/**
 * Wizard trả phòng — sinh meter_readings reason='3' và hoá đơn is_settlement.
 * Toàn bộ nằm trong một transaction ở backend.
 */
export default function MoveOut() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [endDate, setEndDate] = useState<string>(todayISO())
  const [readings, setReadings] = useState<ReadingInput[] | null>(null)
  const [deduction, setDeduction] = useState('0')
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data, error, loading, reload } = useApi(
    (isAlive) =>
      api.moveOutPreview(id!, endDate).then((res) => {
        // Đổi ngày trả phòng liên tục thì response cũ có thể về sau.
        if (!isAlive()) return res

        setReadings(res.meters.map((m) => ({ ...m, reading: String(m.prev_reading) })))
        return res
      }),
    [id, endDate],
    { enabled: !!id },
  )

  const submitMut = useMutation(
    (payload: Parameters<typeof api.moveOut>[1]) => api.moveOut(id!, payload),
    {
      success: (r) => `Đã tất toán. Hoá đơn ${r.code}.`,
      onSuccess: (r) => navigate(`/invoices/${r.invoice_id}`),
    },
  )

  if (loading || !readings) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  // Vào thẳng bằng URL cho hợp đồng chưa tới ngày vào — cả trang vô nghĩa,
  // chặn hẳn thay vì để điền hết rồi mới báo lỗi lúc bấm nút.
  if (data.start_date > todayISO()) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/contracts" className="text-sm text-sky-700 hover:underline">
          ← Hợp đồng
        </Link>
        <div className="card border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="font-semibold">Hợp đồng chưa bắt đầu</div>
          <p className="mt-1">
            {data.tenant_name} thuê phòng {data.room_code} từ {date(data.start_date)} — chưa ở ngày
            nào thì chưa trả phòng được.
          </p>
          <p className="mt-2 text-xs">
            Nếu khách đổi ý không thuê nữa thì đó là huỷ hợp đồng, không phải trả phòng.
          </p>
        </div>
      </div>
    )
  }

  // Ước tính hiển thị — số chính thức do backend dựng lại lúc submit.
  const daysInMonth = new Date(Number(endDate.slice(0, 4)), Number(endDate.slice(5, 7)), 0).getDate()
  const rentPerDay = Math.round(data.rent_amount / daysInMonth)
  const rentEstimate = rentPerDay * data.days
  const depositLeft = Math.max(0, data.deposit_held - (Number(deduction) || 0))

  function validate(): boolean {
    if (!readings || !data) return false

    const raw: Record<string, string | null> = {}

    readings.forEach((m) => {
      const field = m.type === MeterType.Electric ? 'reading_electric' : 'reading_water'
      raw[`reading-${m.meter_id}`] = check(field, m.reading, [
        required,
        notNegative,
        notLessThan(m.prev_reading, num(m.prev_reading)),
      ])
    })

    // So với NGÀY VÀO, không so với period_from: period_from là ngày sau đoạn đã
    // ra hoá đơn, nên khách trả đủ tới ngày 14 rồi đi ngày 14 sẽ bị chặn oan.
    raw.end_date = check(
      'end_date',
      endDate,
      [required, dateAfter(data.start_date, 'ngày vào')],
      'Ngày trả phòng',
    )

    raw.deduction = check('deduction', deduction, [
      required,
      notNegative,
      max(data.deposit_held, `${moneyd(data.deposit_held)} (cọc đang giữ)`),
    ])

    // Lý do chỉ bắt buộc khi thực sự trừ tiền — khớp với Rule::requiredIf ở backend.
    raw.deduction_reason = Number(deduction) > 0 ? check('deduction_reason', reason, [required]) : null

    const clean = compact(raw)
    setErrors(clean as Record<string, string>)
    return !hasErrors(clean)
  }

  async function submit() {
    if (!validate() || !readings || !data) {
      toast.error(msg('formInvalid'))
      return
    }

    const agreed = await confirm({
      title: 'Tất toán và trả phòng?',
      message: `${data.tenant_name} trả phòng ${data.room_code} ngày ${date(endDate)}. Thao tác này khó lùi lại.`,
      details: [
        'Hợp đồng chuyển sang trạng thái đã kết thúc.',
        'Phòng chuyển sang trạng thái trống, cho thuê lại được ngay.',
        'Phát hành hoá đơn tất toán — không còn là nháp.',
        Number(deduction) > 0 ? `Trừ cọc ${moneyd(deduction)}: ${reason}` : 'Không trừ cọc',
        refund ? `Hoàn cọc ${moneyd(depositLeft)} cho khách` : 'Chưa hoàn cọc',
      ],
      confirmLabel: 'Tất toán',
      tone: 'danger',
    })
    if (!agreed) return

    await submitMut.run({
      end_date: endDate,
      meter_readings: readings.map((m) => ({ meter_id: m.meter_id, reading: Number(m.reading) })),
      deposit_deduction: Number(deduction) || 0,
      deduction_reason: reason || null,
      refund_deposit: refund,
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/" className="text-sm text-sky-700 hover:underline">
          ← Tổng quan
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">
          Trả phòng — {data.room_code} · {data.tenant_name}
        </h1>
      </div>

      <Section title="1 · Ngày trả phòng">
        <Field error={errors.end_date} className="w-48">
          <input type="date" className="field" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        {data.billable ? (
          <p className="mt-1 text-xs text-slate-500">
            Kỳ tính: {date(data.period_from)} → {date(endDate)} ({data.days} ngày)
            {data.billed_to && <> · đã chốt sổ tới {date(data.billed_to)}</>}
          </p>
        ) : (
          <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            ℹ Đã ra hoá đơn tới hết ngày <b>{date(data.billed_to)}</b>, tức là khách đã được
            tính tiền quá ngày đi. Tất toán này <b>không phát sinh thêm tiền</b> — chỉ kết thúc
            hợp đồng và xử lý cọc.
          </div>
        )}
      </Section>

      <Section title="2 · Chốt số đồng hồ tại ngày trả">
        <div className="space-y-2">
          {readings.map((m, i) => {
            const consumption = Math.max(0, Number(m.reading) - m.prev_reading)
            return (
              <div key={m.meter_id} className="flex flex-wrap items-center gap-3">
                <span className="w-14 font-medium text-slate-700">
                  {m.type === MeterType.Electric ? 'Điện' : 'Nước'}
                </span>
                <span className="text-sm tabular-nums text-slate-500">
                  {num(m.prev_reading)} ({date(m.prev_read_date)})
                </span>
                <span className="text-slate-400">→</span>
                <div>
                  <input
                    className={`num-input w-32 ${errors[`reading-${m.meter_id}`] ? 'border-rose-400' : ''}`}
                    inputMode="decimal"
                    value={m.reading}
                    onChange={(e) => {
                      const next = [...readings]
                      next[i] = { ...m, reading: e.target.value }
                      setReadings(next)
                    }}
                  />
                  {errors[`reading-${m.meter_id}`] && (
                    <p className="mt-1 text-[11px] text-rose-600">{errors[`reading-${m.meter_id}`]}</p>
                  )}
                </div>
                <span className="text-sm tabular-nums text-slate-600">
                  = {num(consumption)} {METER_UNIT[m.type]}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="3 · Ước tính hoá đơn tất toán">
        <dl className="space-y-1 text-sm">
          <Line label={`Tiền phòng ${data.days} ngày × ${money(rentPerDay)}`} value={rentEstimate} />
          <Line label="Điện, nước, rác…" value={null} hint="tính chính xác khi bấm tất toán" />
          {data.carried_over > 0 && (
            <Line label="Nợ kỳ trước" value={data.carried_over} tone="text-amber-700" />
          )}
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          Tiền rác tính nguyên tháng dù ở lẻ ngày (khoản cố định). Muốn giảm thì sửa hoá đơn khi còn
          nháp — hoặc chỉnh giảm giá sau khi tạo.
        </p>
      </Section>

      <Section title="4 · Xử lý cọc">
        <div className="space-y-3 text-sm">
          <div>
            Cọc đang giữ: <b className="tabular-nums">{moneyd(data.deposit_held)}</b>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trừ hỏng hóc" error={errors.deduction}>
              <input
                className="field text-right tabular-nums"
                inputMode="numeric"
                value={deduction}
                onChange={(e) => setDeduction(e.target.value)}
              />
            </Field>
            <Field label="Lý do trừ" error={errors.deduction_reason}>
              <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            Hoàn lại cho khách <b className="tabular-nums">{moneyd(depositLeft)}</b>
          </label>
        </div>
      </Section>

      <div className="flex justify-between">
        <Link to="/" className="btn-ghost">
          Huỷ
        </Link>
        <button className="btn-primary" disabled={submitMut.busy} onClick={submit}>
          {submitMut.busy ? 'Đang xử lý…' : 'TẤT TOÁN & TRẢ PHÒNG'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-bold text-slate-700">{title}</h2>
      {children}
    </div>
  )
}

function Line({
  label,
  value,
  hint,
  tone = '',
}: {
  label: string
  value: number | null
  hint?: string
  tone?: string
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={`text-slate-600 ${tone}`}>{label}</dt>
      <dd className={`tabular-nums ${tone}`}>
        {value === null ? <span className="text-xs text-slate-400">{hint}</span> : money(value)}
      </dd>
    </div>
  )
}
