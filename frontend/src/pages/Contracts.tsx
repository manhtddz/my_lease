import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { date, moneyd } from '@/lib/format'
import { Badge, Empty, ErrorBox, Spinner } from '@/components/ui'
import { CONTRACT_STATUS_LABEL, CONTRACT_TONE, ContractStatus, RoomStatus } from '@/types'

export default function Contracts() {
  const { data, error, loading, reload } = useApi(() => api.contracts(), [])
  const roomsQuery = useApi(() => api.rooms(), [])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const vacant = (roomsQuery.data?.rows ?? []).filter((r) => r.status === RoomStatus.Vacant)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Hợp đồng</h1>

      {vacant.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-4">
          <span className="text-sm text-slate-600">Phòng trống:</span>
          {vacant.map((room) => (
            <Link key={room.id} to={`/contracts/move-in/${room.id}`} className="btn-ghost px-3 py-1 text-xs">
              + Cho thuê {room.code}
            </Link>
          ))}
        </div>
      )}

      {data.rows.length === 0 ? (
        <div className="card">
          <Empty>Chưa có hợp đồng nào.</Empty>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-3xl text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2 text-left">Mã</th>
                <th className="px-3 py-2 text-left">Phòng</th>
                <th className="px-3 py-2 text-left">Khách</th>
                <th className="px-3 py-2 text-left">Thời hạn</th>
                <th className="px-3 py-2 text-right">Tiền phòng</th>
                <th className="px-3 py-2 text-right">Cọc giữ</th>
                <th className="px-3 py-2 text-center">Người ở</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{c.code}</td>
                  <td className="px-3 py-2">{c.room_code}</td>
                  <td className="px-3 py-2">
                    <div className="text-slate-800">{c.tenant_name}</div>
                    <div className="text-xs text-slate-400">{c.tenant_phone}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {date(c.start_date)} →{' '}
                    {c.actual_end_date ? date(c.actual_end_date) : c.end_date ? date(c.end_date) : 'không hạn'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{moneyd(c.rent_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{moneyd(c.deposit_held)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.occupant_count}</td>
                  <td className="px-3 py-2">
                    <Badge tone={CONTRACT_TONE[c.status]}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.status === ContractStatus.Active && (
                      <Link to={`/contracts/${c.id}/move-out`} className="text-xs text-sky-700 hover:underline">
                        Trả phòng
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
