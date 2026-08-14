import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { moneyd, num, todayISO } from '@/lib/format'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner, useToast } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import { msg } from '@/lib/messages'
import { check, compact, hasErrors, notNegative, required, type Errors } from '@/lib/validate'
import {
  ROOM_STATUS_LABEL,
  ROOM_TONE,
  RoomStatus,
  type Building,
  type Room,
} from '@/types'

type RoomField = 'room_code' | 'building_id' | 'area_m2' | 'default_rent'

/** Bản nháp đang sửa — số giữ dạng chuỗi vì đến từ input. */
interface RoomForm {
  building_id: string
  code: string
  area_m2: string
  default_rent: string
  status: RoomStatus
  note: string
  electric_initial: string
  water_initial: string
  meter_installed_at: string
}

function emptyForm(buildingId: number | undefined): RoomForm {
  return {
    building_id: buildingId ? String(buildingId) : '',
    code: '',
    area_m2: '',
    default_rent: '',
    status: RoomStatus.Vacant,
    note: '',
    electric_initial: '0',
    water_initial: '0',
    meter_installed_at: todayISO(),
  }
}

function toForm(room: Room): RoomForm {
  return {
    building_id: String(room.building_id),
    code: room.code,
    area_m2: room.area_m2 === null ? '' : String(room.area_m2),
    default_rent: String(room.default_rent),
    status: room.status,
    note: room.note ?? '',
    electric_initial: '0',
    water_initial: '0',
    meter_installed_at: todayISO(),
  }
}

/**
 * Quản lý phòng.
 *
 * Trạng thái "Đang thuê" không sửa tay được — nó do hợp đồng quyết định, cho
 * sửa sẽ khiến dashboard và màn Ghi số nói khác nhau về cùng một phòng.
 */
export default function Rooms() {
  const toast = useToast()
  const confirm = useConfirm()

  /** null = đóng modal · 'new' = tạo mới · Room = đang sửa. */
  const [editing, setEditing] = useState<Room | 'new' | null>(null)

  const { data, error, loading, reload } = useApi(() => api.rooms(), [])
  const buildings = useApi(() => api.buildings(), [])

  const deleteMut = useMutation((room: Room) => api.deleteRoom(room.id), {
    success: 'Đã xoá phòng.',
    onSuccess: () => reload(),
  })

  if (loading || buildings.loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (buildings.error) return <ErrorBox error={buildings.error} onRetry={buildings.reload} />
  if (!data || !buildings.data) return null

  const rooms = data.rows
  const buildingRows = buildings.data.rows

  // Nhóm theo toà để mắt bắt được cấu trúc tài sản, giống cách Dashboard trình bày.
  const groups = rooms.reduce<Record<string, Room[]>>((acc, room) => {
    ;(acc[room.building_name] ??= []).push(room)
    return acc
  }, {})

  const occupied = rooms.filter((r) => r.status === RoomStatus.Occupied).length
  const vacant = rooms.filter((r) => r.status === RoomStatus.Vacant).length

  async function remove(room: Room) {
    const agreed = await confirm({
      title: `Xoá phòng ${room.code}?`,
      message: `Phòng ${room.code} · ${room.building_name} sẽ bị xoá cùng đồng hồ điện nước của nó.`,
      details: [
        'Chỉ xoá được phòng chưa từng có hợp đồng và chưa ghi chỉ số.',
        'Phòng đã dùng rồi thì chuyển sang trạng thái Bảo trì thay vì xoá.',
      ],
      confirmLabel: 'Xoá phòng',
      tone: 'danger',
    })
    if (!agreed) return

    await deleteMut.run(room)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Phòng</h1>
          <p className="text-sm text-slate-500">
            {rooms.length} phòng · {occupied} đang thuê · {vacant} trống
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={buildingRows.length === 0}
          title={buildingRows.length === 0 ? 'Chưa có toà/dãy nào' : undefined}
          onClick={() => setEditing('new')}
        >
          + Thêm phòng
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="card">
          <Empty>Chưa có phòng nào. Thêm phòng để bắt đầu ghi số và chốt sổ.</Empty>
        </div>
      ) : (
        Object.entries(groups).map(([building, list]) => (
          <section key={building}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              {building}
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-3xl text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2 text-left">Mã</th>
                    <th className="px-3 py-2 text-right">Diện tích</th>
                    <th className="px-3 py-2 text-right">Tiền phòng mặc định</th>
                    <th className="px-3 py-2 text-left">Trạng thái</th>
                    <th className="px-3 py-2 text-left">Khách</th>
                    <th className="px-3 py-2 text-left">Ghi chú</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((room) => (
                    <tr key={room.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {room.code}
                        {room.meter_count < 2 && (
                          <div className="text-[11px] font-normal text-amber-700">
                            ⚠ thiếu đồng hồ — màn Ghi số sẽ bỏ qua phòng này
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {room.area_m2 === null ? '—' : `${num(room.area_m2)} m²`}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {moneyd(room.default_rent)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={ROOM_TONE[room.status]}>{ROOM_STATUS_LABEL[room.status]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {room.tenant_name ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{room.note || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          className="btn-ghost px-3 py-1 text-xs"
                          onClick={() => setEditing(room)}
                        >
                          Sửa
                        </button>
                        {room.status === RoomStatus.Vacant && (
                          <Link
                            to={`/contracts/move-in/${room.id}`}
                            className="btn-ghost ml-1 px-3 py-1 text-xs"
                          >
                            Cho thuê
                          </Link>
                        )}
                        <button
                          className="ml-1 text-xs text-rose-600 hover:underline disabled:opacity-50"
                          disabled={deleteMut.busy}
                          onClick={() => remove(room)}
                        >
                          xoá
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {editing !== null && (
        <RoomModal
          room={editing === 'new' ? null : editing}
          buildings={buildingRows}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            toast.success(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

interface RoomModalProps {
  /** null = tạo mới. */
  room: Room | null
  buildings: Building[]
  onClose: () => void
  onSaved: (message: string) => void
}

function RoomModal({ room, buildings, onClose, onSaved }: RoomModalProps) {
  const toast = useToast()
  const isNew = room === null

  const [form, setForm] = useState<RoomForm>(() =>
    room ? toForm(room) : emptyForm(buildings[0]?.id),
  )
  const [errors, setErrors] = useState<Errors<RoomField>>({})

  // Phòng đang có khách: trạng thái do hợp đồng giữ, chỉ đọc.
  const statusLocked = room?.status === RoomStatus.Occupied

  const saveMut = useMutation(
    async (payload: RoomForm) => {
      const base = {
        building_id: Number(payload.building_id),
        code: payload.code.trim(),
        area_m2: payload.area_m2 === '' ? null : Number(payload.area_m2),
        default_rent: Number(payload.default_rent),
        status: payload.status,
        note: payload.note.trim() || null,
      }

      if (room) {
        await api.updateRoom(room.id, base)
        return `Đã cập nhật phòng ${base.code}.`
      }

      await api.createRoom({
        ...base,
        electric_initial: payload.electric_initial === '' ? 0 : Number(payload.electric_initial),
        water_initial: payload.water_initial === '' ? 0 : Number(payload.water_initial),
        meter_installed_at: payload.meter_installed_at || null,
      })
      return `Đã thêm phòng ${base.code} kèm đồng hồ điện nước.`
    },
    { onSuccess: (message) => onSaved(message) },
  )

  function patch(next: Partial<RoomForm>) {
    setForm((f) => ({ ...f, ...next }))
  }

  function validate(): boolean {
    const clean = compact<RoomField>({
      building_id: check('building_id', form.building_id, [required]),
      room_code: check('room_code', form.code, [required]),
      default_rent: check('default_rent', form.default_rent, [required, notNegative]),
      area_m2: form.area_m2 === '' ? null : check('area_m2', form.area_m2, [notNegative]),
    })
    setErrors(clean)

    if (hasErrors(clean)) {
      toast.error(msg('formInvalid'))
      return false
    }

    return true
  }

  async function submit() {
    if (!validate()) return
    await saveMut.run(form)
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Thêm phòng' : `Sửa phòng ${room.code}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Toà / dãy *" error={errors.building_id}>
            <select
              className="field"
              value={form.building_id}
              onChange={(e) => patch({ building_id: e.target.value })}
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mã phòng *" error={errors.room_code} hint="Không trùng trong cùng toà">
            <input
              className="field"
              value={form.code}
              onChange={(e) => patch({ code: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Diện tích (m²)" error={errors.area_m2}>
            <input
              className="field text-right tabular-nums"
              inputMode="decimal"
              value={form.area_m2}
              onChange={(e) => patch({ area_m2: e.target.value })}
            />
          </Field>
          <Field
            label="Tiền phòng mặc định *"
            error={errors.default_rent}
            hint="Giá gợi ý khi tạo hợp đồng"
          >
            <input
              className="field text-right tabular-nums"
              inputMode="numeric"
              value={form.default_rent}
              onChange={(e) => patch({ default_rent: e.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Trạng thái"
          hint={
            statusLocked
              ? 'Phòng đang có khách — trả phòng trước nếu muốn đổi trạng thái.'
              : 'Bảo trì = tạm ngừng cho thuê, vẫn giữ lịch sử.'
          }
        >
          <select
            className="field"
            value={form.status}
            disabled={statusLocked}
            onChange={(e) => patch({ status: e.target.value as RoomStatus })}
          >
            {statusLocked ? (
              <option value={RoomStatus.Occupied}>{ROOM_STATUS_LABEL[RoomStatus.Occupied]}</option>
            ) : (
              <>
                <option value={RoomStatus.Vacant}>{ROOM_STATUS_LABEL[RoomStatus.Vacant]}</option>
                <option value={RoomStatus.Maintenance}>
                  {ROOM_STATUS_LABEL[RoomStatus.Maintenance]}
                </option>
              </>
            )}
          </select>
        </Field>

        <Field label="Ghi chú">
          <input
            className="field"
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </Field>

        {isNew && (
          <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs text-sky-900">
              Phòng mới được tạo kèm <b>1 đồng hồ điện + 1 đồng hồ nước</b>. Thiếu đồng hồ thì màn
              Ghi số bỏ qua phòng và hoá đơn đầu tiên không có tiền điện nước.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Chỉ số điện gốc">
                <input
                  className="field text-right tabular-nums"
                  inputMode="decimal"
                  value={form.electric_initial}
                  onChange={(e) => patch({ electric_initial: e.target.value })}
                />
              </Field>
              <Field label="Chỉ số nước gốc">
                <input
                  className="field text-right tabular-nums"
                  inputMode="decimal"
                  value={form.water_initial}
                  onChange={(e) => patch({ water_initial: e.target.value })}
                />
              </Field>
              <Field label="Ngày lắp">
                <input
                  type="date"
                  className="field"
                  value={form.meter_installed_at}
                  onChange={(e) => patch({ meter_installed_at: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose} disabled={saveMut.busy}>
            Huỷ
          </button>
          <button className="btn-primary" onClick={submit} disabled={saveMut.busy}>
            {saveMut.busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
