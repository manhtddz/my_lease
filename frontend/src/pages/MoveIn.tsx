import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { date, money, moneyd, num } from '@/lib/format'
import { ErrorBox, Field as FormField, Spinner, useToast } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import { msg } from '@/lib/messages'
import {
  check,
  compact,
  dateAfter,
  hasErrors,
  idCard,
  notLessThan,
  notNegative,
  phone,
  positive,
  required,
} from '@/lib/validate'
import {
  Gender,
  METER_UNIT,
  MeterType,
  type MeterSnapshot,
  type MoveInOccupantPayload,
  type ServiceDefault,
} from '@/types'

const STEPS = ['Người thuê', 'Người ở ghép', 'Điều khoản', 'Chốt số đồng hồ'] as const

/** Khoản dịch vụ trong form — giá giữ dạng chuỗi vì đến từ input. */
interface ServiceRow extends Omit<ServiceDefault, 'unit_price'> {
  unit_price: string
  quantity_fixed?: string
}

interface ReadingInput extends MeterSnapshot {
  reading: string
}

interface MoveInForm {
  tenant: {
    full_name: string
    phone: string
    id_card_no: string
    dob: string
    gender: Gender
    hometown: string
  }
  occupants: MoveInOccupantPayload[]
  start_date: string
  end_date: string
  rent_amount: string
  deposit_amount: string
  occupant_count: string
  note: string
  services: ServiceRow[]
  disabledServices: ServiceRow[]
  meter_readings: ReadingInput[]
}

/**
 * Wizard nhận khách mới — sinh meter_readings reason='2'.
 * Bước 4 bắt buộc: thiếu nó thì hoá đơn đầu tiên sẽ tính cả điện của khách trước.
 */
export default function MoveIn() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<MoveInForm | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data, error, loading, reload } = useApi(
    (isAlive) =>
      api.moveInDefaults(roomId!).then((res) => {
        if (!isAlive()) return res

        const toRow = (s: ServiceDefault): ServiceRow => ({ ...s, unit_price: String(s.unit_price) })

        setForm({
          tenant: {
            full_name: '',
            phone: '',
            id_card_no: '',
            dob: '',
            gender: Gender.Male,
            hometown: '',
          },
          occupants: [],
          start_date: res.today,
          end_date: '',
          rent_amount: String(res.room.default_rent),
          deposit_amount: String(res.room.default_rent),
          occupant_count: '1',
          note: '',
          services: res.services.filter((s) => s.suggested).map(toRow),
          disabledServices: res.services.filter((s) => !s.suggested).map(toRow),
          meter_readings: res.meters.map((m) => ({ ...m, reading: String(m.prev_reading) })),
        })

        return res
      }),
    [roomId],
    { enabled: !!roomId },
  )

  const submitMut = useMutation(
    (payload: Parameters<typeof api.moveIn>[0]) => api.moveIn(payload),
    { success: (r) => `Đã tạo hợp đồng ${r.code}.`, onSuccess: () => navigate('/') },
  )

  if (loading || !form) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const allServices = [...form.services, ...form.disabledServices].sort(
    (a, b) => a.service_item_id - b.service_item_id,
  )

  function patch(next: Partial<MoveInForm>) {
    setForm((f) => (f ? { ...f, ...next } : f))
  }

  function toggleService(serviceItemId: number) {
    if (!form) return

    const inActive = form.services.find((s) => s.service_item_id === serviceItemId)
    if (inActive) {
      patch({
        services: form.services.filter((s) => s.service_item_id !== serviceItemId),
        disabledServices: [...form.disabledServices, inActive],
      })
      return
    }

    const item = form.disabledServices.find((s) => s.service_item_id === serviceItemId)
    if (!item) return

    patch({
      services: [...form.services, item],
      disabledServices: form.disabledServices.filter((s) => s.service_item_id !== serviceItemId),
    })
  }

  function setServiceField(serviceItemId: number, key: 'unit_price' | 'quantity_fixed', value: string) {
    if (!form) return
    patch({
      services: form.services.map((s) =>
        s.service_item_id === serviceItemId ? { ...s, [key]: value } : s,
      ),
    })
  }

  /** Validate riêng từng bước — chặn ngay tại bước sai, không dồn tới cuối. */
  function validateStep(index: number): boolean {
    if (!form) return false

    let raw: Record<string, string | null> = {}

    if (index === 0) {
      raw = {
        full_name: check('full_name', form.tenant.full_name, [required]),
        phone: check('phone', form.tenant.phone, [phone]),
        id_card_no: check('id_card_no', form.tenant.id_card_no, [idCard]),
      }
    }

    if (index === 1) {
      form.occupants.forEach((o, i) => {
        raw[`occupant-${i}`] = check('occupant_name', o.full_name, [required])
        raw[`occupant-card-${i}`] = check('id_card_no', o.id_card_no, [idCard])
      })
    }

    if (index === 2) {
      form.services.forEach((s) => {
        raw[`service-${s.service_item_id}`] = check('unit_price', s.unit_price, [required, notNegative])
      })

      raw.rent_amount = check('rent_amount', form.rent_amount, [required, positive])
      raw.deposit_amount = check('deposit_amount', form.deposit_amount, [required, notNegative])
      raw.start_date = check('start_date', form.start_date, [required])
      raw.occupant_count = check('occupant_count', form.occupant_count, [required, positive])
      raw.end_date = check('end_date', form.end_date, [dateAfter(form.start_date, 'ngày vào')])
    }

    if (index === 3) {
      form.meter_readings.forEach((m) => {
        const field = m.type === MeterType.Electric ? 'reading_electric' : 'reading_water'
        raw[`reading-${m.meter_id}`] = check(field, m.reading, [
          required,
          notNegative,
          notLessThan(m.prev_reading, num(m.prev_reading)),
        ])
      })
    }

    const clean = compact(raw)
    setErrors(clean as Record<string, string>)
    return !hasErrors(clean)
  }

  function goNext() {
    if (!validateStep(step)) {
      toast.error(msg('formInvalid'))
      return
    }
    setStep((s) => s + 1)
  }

  async function submit() {
    if (!form || !data) return

    // Chạy lại validate tất cả các bước — người dùng có thể quay lại sửa rồi nhảy tới.
    for (let i = 0; i <= 3; i++) {
      if (!validateStep(i)) {
        setStep(i)
        toast.error(msg('stepIncomplete', null, { step: i + 1 }))
        return
      }
    }

    const agreed = await confirm({
      title: 'Tạo hợp đồng mới?',
      message: `${form.tenant.full_name} sẽ thuê phòng ${data.room.code} từ ngày ${date(form.start_date)}.`,
      details: [
        `Tiền phòng ${moneyd(form.rent_amount)} / tháng`,
        `Tiền cọc ${moneyd(form.deposit_amount)} — sẽ ghi nhận là đã thu`,
        `${form.services.length} khoản phí dịch vụ`,
        `Chốt số đồng hồ: ${form.meter_readings
          .map((m) => `${m.type === MeterType.Electric ? 'điện' : 'nước'} ${num(m.reading)}`)
          .join(', ')}`,
        'Phòng chuyển sang trạng thái đang thuê.',
      ],
      confirmLabel: 'Tạo hợp đồng',
    })
    if (!agreed) return

    await submitMut.run({
      room_id: Number(roomId),
      tenant: {
        ...form.tenant,
        dob: form.tenant.dob || null,
      },
      start_date: form.start_date,
      end_date: form.end_date || null,
      rent_amount: Number(form.rent_amount),
      deposit_amount: Number(form.deposit_amount),
      occupant_count: Number(form.occupant_count),
      note: form.note || null,
      occupants: form.occupants.filter((o) => o.full_name.trim()),
      services: form.services.map((s) => ({
        service_item_id: s.service_item_id,
        unit_price: Number(s.unit_price),
        quantity_fixed: s.quantity_fixed ? Number(s.quantity_fixed) : null,
      })),
      meter_readings: form.meter_readings.map((m) => ({
        meter_id: m.meter_id,
        reading: Number(m.reading),
      })),
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link to="/" className="text-sm text-sky-700 hover:underline">
          ← Tổng quan
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">
          Nhận khách mới — phòng {data.room.code}
        </h1>
        <p className="text-sm text-slate-500">{data.room.building_name}</p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 font-medium ${
              i === step
                ? 'bg-sky-600 text-white'
                : i < step
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-500'
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="card p-5">
        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Họ tên *" span error={errors.full_name}>
              <input
                className="field"
                value={form.tenant.full_name}
                onChange={(e) => patch({ tenant: { ...form.tenant, full_name: e.target.value } })}
              />
            </Field>
            <Field label="Số điện thoại" error={errors.phone}>
              <input
                className="field"
                value={form.tenant.phone}
                onChange={(e) => patch({ tenant: { ...form.tenant, phone: e.target.value } })}
              />
            </Field>
            <Field label="CCCD / CMND" error={errors.id_card_no} hint="12 số (CCCD) hoặc 9 số (CMND)">
              <input
                className="field"
                value={form.tenant.id_card_no}
                onChange={(e) => patch({ tenant: { ...form.tenant, id_card_no: e.target.value } })}
              />
            </Field>
            <Field label="Ngày sinh">
              <input
                type="date"
                className="field"
                value={form.tenant.dob}
                onChange={(e) => patch({ tenant: { ...form.tenant, dob: e.target.value } })}
              />
            </Field>
            <Field label="Giới tính">
              <select
                className="field"
                value={form.tenant.gender}
                onChange={(e) => patch({ tenant: { ...form.tenant, gender: e.target.value as Gender } })}
              >
                <option value={Gender.Male}>Nam</option>
                <option value={Gender.Female}>Nữ</option>
                <option value={Gender.Other}>Khác</option>
              </select>
            </Field>
            <Field label="Thường trú (khai tạm trú)" span>
              <input
                className="field"
                value={form.tenant.hometown}
                onChange={(e) => patch({ tenant: { ...form.tenant, hometown: e.target.value } })}
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Người ở cùng — phục vụ khai tạm trú. Không dùng để tách tiền: một hợp đồng chỉ một người trả.
            </p>
            {form.occupants.map((occupant, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <input
                    className={`field ${errors[`occupant-${i}`] ? 'border-rose-400' : ''}`}
                    placeholder="Họ tên"
                    value={occupant.full_name}
                    onChange={(e) => {
                      const next = [...form.occupants]
                      next[i] = { ...occupant, full_name: e.target.value }
                      patch({ occupants: next })
                    }}
                  />
                  {errors[`occupant-${i}`] && (
                    <p className="mt-1 text-[11px] text-rose-600">{errors[`occupant-${i}`]}</p>
                  )}
                </div>
                <div>
                  <input
                    className={`field ${errors[`occupant-card-${i}`] ? 'border-rose-400' : ''}`}
                    placeholder="CCCD"
                    value={occupant.id_card_no ?? ''}
                    onChange={(e) => {
                      const next = [...form.occupants]
                      next[i] = { ...occupant, id_card_no: e.target.value }
                      patch({ occupants: next })
                    }}
                  />
                  {errors[`occupant-card-${i}`] && (
                    <p className="mt-1 text-[11px] text-rose-600">{errors[`occupant-card-${i}`]}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    className="field"
                    placeholder="Quan hệ"
                    value={occupant.relationship ?? ''}
                    onChange={(e) => {
                      const next = [...form.occupants]
                      next[i] = { ...occupant, relationship: e.target.value }
                      patch({ occupants: next })
                    }}
                  />
                  <button
                    className="btn-danger px-2"
                    onClick={() => patch({ occupants: form.occupants.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <button
              className="btn-ghost"
              onClick={() =>
                patch({
                  occupants: [...form.occupants, { full_name: '', id_card_no: '', relationship: '' }],
                  occupant_count: String(form.occupants.length + 2),
                })
              }
            >
              + Thêm người ở ghép
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tiền phòng / tháng" error={errors.rent_amount}>
                <input
                  className="field text-right tabular-nums"
                  inputMode="numeric"
                  value={form.rent_amount}
                  onChange={(e) => patch({ rent_amount: e.target.value })}
                />
              </Field>
              <Field label="Tiền cọc" error={errors.deposit_amount}>
                <input
                  className="field text-right tabular-nums"
                  inputMode="numeric"
                  value={form.deposit_amount}
                  onChange={(e) => patch({ deposit_amount: e.target.value })}
                />
              </Field>
              <Field label="Ngày vào" error={errors.start_date}>
                <input
                  type="date"
                  className="field"
                  value={form.start_date}
                  onChange={(e) => patch({ start_date: e.target.value })}
                />
              </Field>
              <Field label="Ngày hết hạn (bỏ trống = không hạn)" error={errors.end_date}>
                <input
                  type="date"
                  className="field"
                  value={form.end_date}
                  onChange={(e) => patch({ end_date: e.target.value })}
                />
              </Field>
              <Field label="Tổng số người ở" error={errors.occupant_count}>
                <input
                  type="number"
                  min="1"
                  className="field"
                  value={form.occupant_count}
                  onChange={(e) => patch({ occupant_count: e.target.value })}
                />
              </Field>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Phí dịch vụ
              </h3>
              <p className="mb-2 text-xs text-slate-400">
                Tiền phòng không nằm ở đây — nó lưu trực tiếp trên hợp đồng để tránh hai nguồn cùng giữ
                một con số.
              </p>
              <div className="space-y-2">
                {allServices.map((s) => {
                  const active = form.services.find((x) => x.service_item_id === s.service_item_id)
                  return (
                    <div
                      key={s.service_item_id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2"
                    >
                      <label className="flex min-w-32 flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!active}
                          onChange={() => toggleService(s.service_item_id)}
                        />
                        {s.name}
                      </label>
                      {active && (
                        <>
                          <div>
                            <input
                              className={`num-input w-28 ${
                                errors[`service-${s.service_item_id}`] ? 'border-rose-400' : ''
                              }`}
                              inputMode="numeric"
                              value={active.unit_price}
                              onChange={(e) =>
                                setServiceField(s.service_item_id, 'unit_price', e.target.value)
                              }
                            />
                            {errors[`service-${s.service_item_id}`] && (
                              <p className="mt-1 text-[11px] text-rose-600">
                                {errors[`service-${s.service_item_id}`]}
                              </p>
                            )}
                          </div>
                          <span className="w-14 text-xs text-slate-500">/ {s.unit_label || 'lần'}</span>
                          {s.code === 'parking' && (
                            <input
                              className="num-input w-16"
                              placeholder="SL"
                              value={active.quantity_fixed ?? ''}
                              onChange={(e) =>
                                setServiceField(s.service_item_id, 'quantity_fixed', e.target.value)
                              }
                            />
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Chốt số đồng hồ tại ngày vào <b>{date(form.start_date)}</b>. Bắt buộc — đây là điểm khởi đầu
              chuỗi đọc của khách này.
            </p>
            {form.meter_readings.map((m, i) => {
              const consumption = Number(m.reading) - m.prev_reading
              return (
                <div
                  key={m.meter_id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <span className="w-16 font-medium text-slate-700">
                    {m.type === MeterType.Electric ? 'Điện' : 'Nước'}
                  </span>
                  <span className="text-sm text-slate-500">
                    số cũ <b className="tabular-nums">{num(m.prev_reading)}</b> ({date(m.prev_read_date)})
                  </span>
                  <span className="text-slate-400">→</span>
                  <div>
                    <input
                      className={`num-input w-32 ${errors[`reading-${m.meter_id}`] ? 'border-rose-400' : ''}`}
                      inputMode="decimal"
                      value={m.reading}
                      onChange={(e) => {
                        const next = [...form.meter_readings]
                        next[i] = { ...m, reading: e.target.value }
                        patch({ meter_readings: next })
                      }}
                    />
                    {errors[`reading-${m.meter_id}`] && (
                      <p className="mt-1 text-[11px] text-rose-600">{errors[`reading-${m.meter_id}`]}</p>
                    )}
                  </div>
                  <span className="text-sm tabular-nums text-slate-600">
                    = {num(Math.max(0, consumption))} {METER_UNIT[m.type]}
                  </span>
                </div>
              )
            })}

            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              ℹ Phần tiêu thụ trước mốc này thuộc khoảng phòng trống → ghi vào <b>chi phí của bạn</b>,
              không tính cho khách mới.
            </div>

            <div className="card border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="mb-1 font-semibold text-slate-700">Tóm tắt</div>
              <div>Khách: {form.tenant.full_name || '—'}</div>
              <div>Tiền phòng: {moneyd(form.rent_amount)} / tháng</div>
              <div>Cọc: {moneyd(form.deposit_amount)}</div>
              <div>
                Phí dịch vụ:{' '}
                {form.services.map((s) => `${s.name} ${money(s.unit_price)}`).join(' · ') || 'không có'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ← Quay lại
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn-primary" onClick={goNext}>
            Tiếp →
          </button>
        ) : (
          <button className="btn-primary" disabled={submitMut.busy} onClick={submit}>
            {submitMut.busy ? 'Đang lưu…' : 'HOÀN TẤT'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Bọc Field dùng chung, thêm tiện ích span 2 cột cho lưới form. */
function Field({
  label,
  children,
  span,
  error,
  hint,
}: {
  label?: string
  children: ReactNode
  span?: boolean
  error?: string
  hint?: string
}) {
  return (
    <FormField label={label} error={error} hint={hint} className={span ? 'sm:col-span-2' : ''}>
      {children}
    </FormField>
  )
}
