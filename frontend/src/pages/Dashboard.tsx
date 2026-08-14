import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { currentPeriod, date, moneyd, moneyShort, todayISO } from '@/lib/format'
import { Badge, ErrorBox, Spinner } from '@/components/ui'
import { PeriodNav } from '@/components/PeriodNav'
import {
  ROOM_STATUS_LABEL,
  ROOM_TONE,
  RoomStatus,
  type BannerAction,
  type BannerLevel,
  type DashboardRoom,
  type PeriodYm,
} from '@/types'

const BANNER_STYLE: Record<BannerLevel, string> = {
  danger: 'border-rose-300 bg-rose-50 text-rose-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

const BANNER_ICON: Record<BannerLevel, string> = {
  danger: '🔴',
  warning: '⚠',
  info: 'ℹ',
  success: '✓',
}

const ACTION_ROUTE: Record<BannerAction, (p: PeriodYm) => string> = {
  read: (p) => `/readings?period=${p}`,
  billing: (p) => `/billing?period=${p}`,
  invoices: (p) => `/invoices?period=${p}`,
}

export default function Dashboard() {
  const [viewPeriod, setViewPeriod] = useState<PeriodYm>(currentPeriod)

  const navigate = useNavigate()
  const { data, error, loading, reload } = useApi(() => api.dashboard(viewPeriod), [viewPeriod])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const { banner, summary, rooms } = data

  const groups = rooms.reduce<Record<string, DashboardRoom[]>>((acc, room) => {
    ;(acc[room.building_name] ??= []).push(room)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
        <PeriodNav value={viewPeriod} onChange={(p) => p && setViewPeriod(p)} />
      </div>

      {/* Dải cảnh báo — nói rõ việc tiếp theo phải làm là gì */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${BANNER_STYLE[banner.level]}`}
      >
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
        <Stat
          label="Đang nợ"
          value={summary.outstanding}
          tone={summary.outstanding > 0 ? 'text-rose-700' : 'text-slate-900'}
        />
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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{moneyShort(value)}</div>
    </div>
  )
}

function RoomCard({ room }: { room: DashboardRoom }) {
  const contract = room.contract
  const started = contract !== null && contract.start_date <= todayISO()

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between">
        <span className="text-lg font-bold text-slate-900">{room.code}</span>
        <Badge tone={ROOM_TONE[room.status]}>{ROOM_STATUS_LABEL[room.status]}</Badge>
      </div>

      {contract ? (
        <>
          <div className="mt-2 truncate text-sm font-medium text-slate-700">{contract.tenant_name}</div>
          <div className="text-xs text-slate-500">{contract.tenant_phone || '—'}</div>
          <div className="mt-2 text-sm font-semibold tabular-nums text-slate-800">
            {moneyd(contract.rent_amount)}
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
            {/* Có nợ thì đưa thẳng tới danh sách hoá đơn của phòng, nơi có nút Thu tiền */}
            {room.debt > 0 ? (
              <Link to={`/invoices?room_id=${room.id}`} className="btn-primary flex-1 px-2 py-1 text-xs">
                Thu nợ
              </Link>
            ) : (
              <Link to={`/invoices?room_id=${room.id}`} className="btn-ghost flex-1 px-2 py-1 text-xs">
                Hoá đơn
              </Link>
            )}
            {/* Chưa tới ngày vào thì chưa ở ngày nào — không có gì để tất toán. */}
            {started ? (
              <Link
                to={`/contracts/${contract.id}/move-out`}
                className="btn-ghost flex-1 px-2 py-1 text-xs"
              >
                Trả phòng
              </Link>
            ) : (
              <span
                className="btn-ghost flex-1 cursor-not-allowed px-2 py-1 text-center text-xs opacity-40"
                title={`Hợp đồng bắt đầu ${date(contract.start_date)} — chưa trả phòng được`}
              >
                Trả phòng
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 flex-1 text-sm text-slate-400">
            {room.status === RoomStatus.Maintenance ? 'Đang bảo trì' : 'Chưa có khách'}
          </div>
          <Link to={`/contracts/move-in/${room.id}`} className="btn-primary mt-3 w-full py-1.5 text-xs">
            + Cho thuê
          </Link>
        </>
      )}
    </div>
  )
}
