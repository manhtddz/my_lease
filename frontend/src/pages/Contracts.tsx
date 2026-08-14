import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { date, moneyd, todayISO } from '@/lib/format'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner, useToast } from '@/components/ui'
import { msg } from '@/lib/messages'
import { check, compact, hasErrors, notNegative, required, type Errors } from '@/lib/validate'
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_TONE,
  ContractStatus,
  RoomStatus,
  type ContractListRow,
} from '@/types'

export default function Contracts() {
  const { data, error, loading, reload } = useApi(() => api.contracts(), [])
  const roomsQuery = useApi(() => api.rooms(), [])

  /** Hợp đồng đang mở form huỷ — null là đóng. */
  const [cancelling, setCancelling] = useState<ContractListRow | null>(null)

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
                    {c.status === ContractStatus.Active &&
                      // Chưa tới ngày vào thì chưa ở ngày nào — không có gì để tất toán.
                      (c.start_date <= todayISO() ? (
                        <Link
                          to={`/contracts/${c.id}/move-out`}
                          className="text-xs text-sky-700 hover:underline"
                        >
                          Trả phòng
                        </Link>
                      ) : (
                        // Chưa tới ngày vào thì không tất toán được — khách đổi ý
                        // thì là huỷ hợp đồng, việc khác hẳn.
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          title={`Hợp đồng bắt đầu ${date(c.start_date)} — chưa ở ngày nào`}
                          onClick={() => setCancelling(c)}
                        >
                          Huỷ hợp đồng
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cancelling && (
        <CancelModal
          contract={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null)
            reload()
            roomsQuery.reload()
          }}
        />
      )}
    </div>
  )
}

interface CancelModalProps {
  contract: ContractListRow
  onClose: () => void
  onDone: () => void
}

type CancelField = 'deposit_deduction' | 'deduction_reason'

/**
 * Huỷ hợp đồng chưa tới ngày vào.
 *
 * Không dùng chung với trả phòng vì không có ngày nào đã ở: không hoá đơn,
 * không chốt số đồng hồ — chỉ hoàn cọc và trả phòng về trống.
 */
function CancelModal({ contract, onClose, onDone }: CancelModalProps) {
  const toast = useToast()
  const held = contract.deposit_held

  const [deduction, setDeduction] = useState('0')
  const [deductionReason, setDeductionReason] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<CancelField>>({})

  const refund = Math.max(0, held - (Number(deduction) || 0))

  const cancelMut = useMutation(
    () =>
      api.cancelContract(contract.id, {
        deposit_deduction: Number(deduction) || 0,
        deduction_reason: deductionReason.trim() || null,
        refund_deposit: true,
        reason: reason.trim() || null,
      }),
    { success: `Đã huỷ hợp đồng ${contract.code}.`, onSuccess: () => onDone() },
  )

  function validate(): boolean {
    const clean = compact<CancelField>({
      deposit_deduction: check('deduction', deduction, [required, notNegative]),
      deduction_reason:
        Number(deduction) > 0 ? check('deduction_reason', deductionReason, [required]) : null,
    })
    setErrors(clean)

    if (Number(deduction) > held) {
      setErrors({ ...clean, deposit_deduction: `Không vượt quá ${moneyd(held)} (cọc đang giữ)` })
      toast.error(msg('formInvalid'))
      return false
    }

    if (hasErrors(clean)) {
      toast.error(msg('formInvalid'))
      return false
    }

    return true
  }

  async function submit() {
    if (!validate()) return
    await cancelMut.run()
  }

  return (
    <Modal open onClose={onClose} title={`Huỷ hợp đồng ${contract.code}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium text-slate-800">
            {contract.tenant_name} · phòng {contract.room_code}
          </div>
          <div className="text-xs text-slate-500">
            Ngày vào {date(contract.start_date)} — chưa tới ngày, chưa ở ngày nào.
          </div>
        </div>

        <ul className="list-inside list-disc space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <li>Hợp đồng chuyển sang trạng thái đã huỷ, không sinh hoá đơn nào.</li>
          <li>Mốc đồng hồ ghi lúc nhận khách sẽ được gỡ để phòng ghi số lại được.</li>
          <li>Phòng {contract.room_code} trở về trạng thái trống, cho thuê lại được ngay.</li>
        </ul>

        <Field
          label={`Phạt huỷ, trừ vào cọc (đang giữ ${moneyd(held)})`}
          error={errors.deposit_deduction}
        >
          <input
            className="field text-right tabular-nums"
            inputMode="numeric"
            value={deduction}
            onChange={(e) => setDeduction(e.target.value)}
          />
        </Field>

        {Number(deduction) > 0 && (
          <Field label="Lý do phạt" error={errors.deduction_reason}>
            <input
              className="field"
              value={deductionReason}
              onChange={(e) => setDeductionReason(e.target.value)}
            />
          </Field>
        )}

        <Field label="Lý do huỷ" hint="Ghi vào lịch sử hợp đồng">
          <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Hoàn lại khách <b className="tabular-nums">{moneyd(refund)}</b>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose} disabled={cancelMut.busy}>
            Đóng
          </button>
          <button className="btn-danger" onClick={submit} disabled={cancelMut.busy}>
            {cancelMut.busy ? 'Đang huỷ…' : 'Huỷ hợp đồng'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
