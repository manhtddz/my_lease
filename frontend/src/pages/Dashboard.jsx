import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { moneyd, moneyShort, nextPeriod, period, prevPeriod } from '../lib/format'
import { Badge, ErrorBox, ROOM_TONE, Spinner } from '../components/ui'

const BANNER_STYLE = {
  danger: 'border-rose-300 bg-rose-50 text-rose-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

const BANNER_ICON = { danger: '🔴', warning: '⚠', info: 'ℹ', success: '✓' }

const ACTION_ROUTE = {
  read: (p) => `/readings?period=${p}`,
  billing: (p) => `/billing?period=${p}`,
  invoices: (p) => `/invoices?period=${p}`,
}

export default function Dashboard() {
  const [currentPeriod, setCurrentPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const navigate = useNavigate()
  const { data, error, loading, reload } = useApi(() => api.dashboard(currentPeriod), [currentPeriod])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const { banner, summary, rooms } = data
  const groups = rooms.reduce((acc, room) => {
    ;(acc[room.building_name] ??= []).push(room)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2 py-1" onClick={() => setCurrentPeriod(prevPeriod(currentPeriod))}>
            ‹
          </button>
          <span className="min-w-24 text-center text-sm font-semibold tabular-nums">
            Kỳ {period(currentPeriod)}
          </span>
          <button className="btn-ghost px-2 py-1" onClick={() => setCurrentPeriod(nextPeriod(currentPeriod))}>
            ›
          </button>
        </div>
      </div>

      {/* Dải cảnh báo — nói rõ việc tiếp theo phải làm là gì */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${BANNER_STYLE[banner.level]}`}>
        <span className="text-sm font-medium">
          {BANNER_ICON[banner.level]} {banner.message}
        </span>
        <button
          className="btn bg-white/80 px-3 py-1.5 text-xs font-bold tracking-wide ring-1 ring-inset ring-black/10 hover:bg-white"
          onClick={() => navigate(ACTION_ROUTE[banner.action](banner.period))}
        >
          {banner.action_label} →
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Doanh thu kỳ" value={summary.income} tone="text-slate-900" />
        <Stat label="Chi phí kỳ" value={summary.expense} tone="text-slate-900" />
        <Stat label="Lãi kỳ" value={summary.profit} tone="text-emerald-700" />
        <Stat label="Đang nợ" value={summary.outstanding} tone={summary.outstanding > 0 ? 'text-rose-700' : 'text-slate-900'} />
      </div>

      {Object.entries(groups).map(([building, list]) => (
        <section key={building}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{building}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{moneyShort(value)}</div>
    </div>
  )
}

function RoomCard({ room }) {
  const occupied = room.status === '2'

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between">
        <span className="text-lg font-bold text-slate-900">{room.code}</span>
        <Badge tone={ROOM_TONE[room.status]}>
          {room.status === '1' ? 'Trống' : room.status === '2' ? 'Đang thuê' : 'Bảo trì'}
        </Badge>
      </div>

      {occupied ? (
        <>
          <div className="mt-2 truncate text-sm font-medium text-slate-700">{room.contract.tenant_name}</div>
          <div className="text-xs text-slate-500">{room.contract.tenant_phone || '—'}</div>
          <div className="mt-2 text-sm font-semibold tabular-nums text-slate-800">
            {moneyd(room.contract.rent_amount)}
            <span className="text-xs font-normal text-slate-400"> /tháng</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {room.debt > 0 ? (
              <Badge tone="rose">Nợ {moneyShort(room.debt)}</Badge>
            ) : (
              <Badge tone="green">Đã thu đủ</Badge>
            )}
            {!room.has_reading_this_period && <Badge tone="amber">Chưa ghi số</Badge>}
          </div>

          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            {/* Có nợ thì đưa thẳng tới danh sách hoá đơn còn nợ của phòng, nơi có nút Thu tiền */}
            {room.debt > 0 ? (
              <Link
                to={`/invoices?room_id=${room.id}&status=`}
                className="btn-primary flex-1 px-2 py-1 text-xs"
              >
                Thu nợ
              </Link>
            ) : (
              <Link to={`/invoices?room_id=${room.id}`} className="btn-ghost flex-1 px-2 py-1 text-xs">
                Hoá đơn
              </Link>
            )}
            <Link to={`/contracts/${room.contract.id}/move-out`} className="btn-ghost flex-1 px-2 py-1 text-xs">
              Trả phòng
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 flex-1 text-sm text-slate-400">Chưa có khách</div>
          <Link to={`/contracts/move-in/${room.id}`} className="btn-primary mt-3 w-full py-1.5 text-xs">
            + Cho thuê
          </Link>
        </>
      )}
    </div>
  )
}
