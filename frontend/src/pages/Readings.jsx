import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { date, num, period } from '../lib/format'
import { Badge, ErrorBox, Spinner, useToast } from '../components/ui'
import { useConfirm } from '../components/confirm'
import { msg } from '../lib/messages'

const EMPTY_ROWS = []

/**
 * Màn hình ghi số điện nước — một trang, một bảng, 12 ô nhập.
 *
 * Cột "Cũ" chỉ đọc (lấy từ chuỗi đọc gần nhất). Tiêu thụ tính ngay khi gõ
 * để phát hiện sai chữ số. Ô "Tính cho" do backend suy ra; phòng đổi khách
 * giữa kỳ sẽ bị chặn và chỉ sang wizard.
 */
export default function Readings() {
  const [params] = useSearchParams()
  const toast = useToast()
  const confirm = useConfirm()

  const [currentPeriod, setCurrentPeriod] = useState(
    () => params.get('period') || new Date().toISOString().slice(0, 7).replace('-', ''),
  )
  const [readDate, setReadDate] = useState('')
  const [values, setValues] = useState({})
  const [changed, setChanged] = useState({})
  const [saving, setSaving] = useState(false)

  const { data, error, loading, reload } = useApi(
    () =>
      api.readingSheet(currentPeriod).then((res) => {
        setReadDate(res.default_read_date)
        const initial = {}
        res.rows.forEach((row) =>
          row.meters.forEach((m) => {
            if (m.existing) initial[m.meter_id] = String(m.existing.reading)
          }),
        )
        setValues(initial)
        setChanged({})
        return res
      }),
    [currentPeriod],
  )

  // Hằng số ngoài render: `?? []` tạo mảng mới mỗi lần, làm useMemo bên dưới
  // tính lại vô ích ở mọi lần render.
  const rows = data?.rows ?? EMPTY_ROWS

  const computed = useMemo(() => {
    const out = {}
    rows.forEach((row) =>
      row.meters.forEach((m) => {
        const raw = values[m.meter_id]
        if (raw === undefined || raw === '') return
        const curr = Number(raw)
        if (Number.isNaN(curr)) return

        const rolled = curr < m.prev_reading
        const consumption = changed[m.meter_id]
          ? curr
          : rolled
            ? 10 ** m.digits - m.prev_reading + curr
            : curr - m.prev_reading

        // Vị trí trong bảng — cảnh báo phải nói rõ dòng nào mới dùng được.
        const where = `${row.room_code} ${m.type === '1' ? 'điện' : 'nước'}`
        const warnings = []
        const errors = []

        // Lỗi: chặn lưu. Cảnh báo: cho lưu nhưng phải xác nhận.
        if (Number.isNaN(Number(raw))) errors.push(msg('readNotNumber', null, { where }))
        if (Number(raw) < 0) errors.push(msg('readNegative', null, { where }))
        if (m.existing?.is_billed) errors.push(msg('readBilled', null, { where }))

        if (rolled && !changed[m.meter_id]) warnings.push(msg('readRollover', null, { where }))
        if (consumption === 0 && row.room_status === '2') warnings.push(msg('readZero', null, { where }))
        if (m.avg_consumption && m.avg_consumption > 0 && consumption > m.avg_consumption * 2) {
          warnings.push(
            msg('readTooHigh', null, {
              where,
              value: num(consumption),
              times: (consumption / m.avg_consumption).toFixed(1),
              average: num(m.avg_consumption),
            }),
          )
        }

        out[m.meter_id] = { consumption: Math.round(consumption * 100) / 100, warnings, errors }
      }),
    )
    return out
  }, [rows, values, changed])

  const filled = Object.values(values).filter((v) => v !== '' && v !== undefined).length
  const totalMeters = rows.reduce((sum, r) => sum + (r.blocked ? 0 : r.meters.length), 0)
  const allWarnings = Object.values(computed).flatMap((c) => c.warnings)
  const allErrors = Object.values(computed).flatMap((c) => c.errors)

  async function save() {
    if (allErrors.length > 0) {
      toast.error('Không lưu được:\n' + allErrors.join('\n'))
      return
    }

    if (allWarnings.length > 0) {
      const agreed = await confirm({
        title: `Lưu dù có ${allWarnings.length} cảnh báo?`,
        message: 'Các số sau trông bất thường. Kiểm tra lại đồng hồ trước khi lưu nếu chưa chắc.',
        details: allWarnings,
        confirmLabel: 'Vẫn lưu',
      })
      if (!agreed) return
    }

    setSaving(true)
    try {
      const entries = []
      rows.forEach((row) => {
        if (row.blocked) return
        row.meters.forEach((m) => {
          const raw = values[m.meter_id]
          if (raw === undefined || raw === '') return
          if (m.existing?.is_billed) return
          entries.push({
            meter_id: m.meter_id,
            reading: Number(raw),
            meter_changed: !!changed[m.meter_id],
          })
        })
      })

      if (!entries.length) {
        toast.error(msg('nothingEntered'))
        return
      }

      const result = await api.saveReadings({
        period_ym: currentPeriod,
        read_date: readDate,
        entries,
      })

      toast.success(`Đã lưu ${result.saved} chỉ số.`)
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ghi số điện nước</h1>
          <p className="text-sm text-slate-500">Kỳ {period(currentPeriod)}</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="label">Kỳ</label>
            <input
              type="month"
              className="field"
              value={`${currentPeriod.slice(0, 4)}-${currentPeriod.slice(4, 6)}`}
              onChange={(e) => setCurrentPeriod(e.target.value.replace('-', ''))}
            />
          </div>
          <div>
            <label className="label">Ngày ghi thực tế</label>
            <input type="date" className="field" value={readDate} onChange={(e) => setReadDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-3xl text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2 text-left">Phòng</th>
              <th className="px-3 py-2 text-right">Điện cũ</th>
              <th className="px-3 py-2 text-right">Điện mới</th>
              <th className="px-3 py-2 text-right">kWh</th>
              <th className="px-3 py-2 text-right">Nước cũ</th>
              <th className="px-3 py-2 text-right">Nước mới</th>
              <th className="px-3 py-2 text-right">m³</th>
              <th className="px-3 py-2 text-left">Tính cho</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const electric = row.meters.find((m) => m.type === '1')
              const water = row.meters.find((m) => m.type === '2')

              return (
                <tr key={row.room_id} className={row.blocked ? 'bg-amber-50/60' : ''}>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-800">{row.room_code}</div>
                    <div className="text-xs text-slate-400">{row.building_name}</div>
                  </td>

                  {row.blocked ? (
                    <td colSpan={6} className="px-3 py-3 text-xs text-amber-800">
                      ⚠ {row.blocked_reason}
                    </td>
                  ) : (
                    <>
                      <MeterCells
                        meter={electric}
                        value={values[electric?.meter_id] ?? ''}
                        computed={computed[electric?.meter_id]}
                        changed={!!changed[electric?.meter_id]}
                        onChange={(v) => setValues((s) => ({ ...s, [electric.meter_id]: v }))}
                        onToggleChanged={() => setChanged((s) => ({ ...s, [electric.meter_id]: !s[electric.meter_id] }))}
                      />
                      <MeterCells
                        meter={water}
                        value={values[water?.meter_id] ?? ''}
                        computed={computed[water?.meter_id]}
                        changed={!!changed[water?.meter_id]}
                        onChange={(v) => setValues((s) => ({ ...s, [water.meter_id]: v }))}
                        onToggleChanged={() => setChanged((s) => ({ ...s, [water.meter_id]: !s[water.meter_id] }))}
                      />
                    </>
                  )}

                  <td className="px-3 py-2 text-xs">
                    {row.blocked ? (
                      <Link to="/contracts" className="font-medium text-sky-700 underline">
                        Dùng wizard →
                      </Link>
                    ) : row.contract_id ? (
                      <span className="text-slate-700">{row.charge_to}</span>
                    ) : (
                      <span className="text-slate-400">— trống —</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {allErrors.length > 0 && (
        <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="mb-1 font-medium">Lỗi — phải sửa mới lưu được</div>
          <ul className="list-inside list-disc space-y-0.5 text-xs">
            {allErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {allWarnings.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-1 font-medium">Cảnh báo — sẽ hỏi lại khi lưu</div>
          <ul className="list-inside list-disc space-y-0.5 text-xs">
            {allWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          Đã nhập <b className="text-slate-800">{filled}</b>/{totalMeters} ô · ngày ghi {date(readDate)}
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            disabled={saving || filled === 0}
            onClick={async () => {
              const agreed = await confirm({
                title: 'Bỏ các số vừa nhập?',
                message: `${filled} ô bạn vừa nhập sẽ bị xoá và tải lại từ dữ liệu đã lưu.`,
                confirmLabel: 'Bỏ thay đổi',
                tone: 'danger',
              })
              if (agreed) reload()
            }}
          >
            Huỷ thay đổi
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || filled === 0 || allErrors.length > 0}>
            {saving ? 'Đang lưu…' : `LƯU ${filled}/${totalMeters} DÒNG`}
          </button>
        </div>
      </div>
    </div>
  )
}

function MeterCells({ meter, value, computed, changed, onChange, onToggleChanged }) {
  if (!meter) return <td colSpan={3} className="px-3 py-2 text-xs text-slate-400">—</td>

  const locked = meter.existing?.is_billed

  return (
    <>
      <td className="px-3 py-2 text-right text-xs text-slate-500 tabular-nums">
        <div>{num(meter.prev_reading)}</div>
        <div className="text-[10px] text-slate-400">{date(meter.prev_read_date)}</div>
      </td>
      <td className="px-2 py-2">
        <input
          className="num-input"
          inputMode="decimal"
          value={value}
          disabled={locked}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
        />
        {value !== '' && Number(value) < meter.prev_reading && (
          <label className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
            <input type="checkbox" checked={changed} onChange={onToggleChanged} />
            đã thay đồng hồ
          </label>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {locked ? (
          <Badge tone="slate">đã chốt</Badge>
        ) : computed ? (
          <span className={computed.warnings.length ? 'font-semibold text-amber-700' : 'font-semibold text-slate-800'}>
            {num(computed.consumption)}
            {computed.warnings.length > 0 && ' ⚠'}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
    </>
  )
}
