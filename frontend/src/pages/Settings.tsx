import { useState } from 'react'
import { api } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { useMutation } from '@/lib/useMutation'
import { money, moneyd } from '@/lib/format'
import { ErrorBox, Field, Spinner, useToast } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import { msg } from '@/lib/messages'
import { check, compact, hasErrors, notNegative, positive, type Errors } from '@/lib/validate'
import { PRICING_MODE_LABEL, type ServiceItem } from '@/types'

type SettingValues = Record<string, string>

export default function Settings() {
  const toast = useToast()
  const confirm = useConfirm()
  const [values, setValues] = useState<SettingValues | null>(null)
  const [errors, setErrors] = useState<Errors>({})

  const settings = useApi(
    (isAlive) =>
      api.settings().then((res) => {
        if (!isAlive()) return res

        setValues(Object.fromEntries(Object.entries(res.rows).map(([k, v]) => [k, v.value ?? ''])))
        return res
      }),
    [],
  )

  const items = useApi(() => api.serviceItems(), [])

  const saveMut = useMutation((v: SettingValues) => api.updateSettings(v), {
    success: 'Đã lưu cấu hình.',
  })

  const saveItemMut = useMutation(
    async (args: { item: ServiceItem; price: string }) => {
      await api.updateServiceItem(args.item.id, { default_price: Number(args.price) })
      return args.item.name
    },
    { success: (name) => `Đã cập nhật giá mặc định ${name}.`, onSuccess: () => items.reload() },
  )

  if (settings.loading || items.loading || !values) return <Spinner />
  if (settings.error) return <ErrorBox error={settings.error} onRetry={settings.reload} />
  if (!settings.data || !items.data) return null

  async function save() {
    if (!values) return

    const clean = compact({
      due_days: check('due_days', values.due_days, [positive]),
    })
    setErrors(clean)

    if (hasErrors(clean)) {
      toast.error(msg('formInvalid'))
      return
    }

    await saveMut.run(values)
  }

  async function saveItem(item: ServiceItem, price: string) {
    const error = check('default_price', price, [notNegative])
    if (error) {
      toast.error(error)
      return
    }

    // Nói rõ phạm vi ảnh hưởng: người dùng dễ tưởng đổi ở đây là tăng giá cho khách hiện tại.
    const agreed = await confirm({
      title: `Đổi giá mặc định của ${item.name}?`,
      message: `Từ ${moneyd(item.default_price)} thành ${moneyd(price)}.`,
      details: [
        'CHỈ áp dụng cho hợp đồng tạo mới sau này.',
        'Khách đang thuê giữ nguyên giá đã ký — muốn tăng thì sửa trong từng hợp đồng.',
        'Hoá đơn đã chốt sổ không đổi.',
      ],
      confirmLabel: 'Đổi giá mặc định',
    })
    if (!agreed) return

    await saveItemMut.run({ item, price })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Cấu hình</h1>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Thông tin in trên hoá đơn</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(settings.data.rows).map(([key, meta]) => (
            <Field key={key} label={meta.note || key} error={errors[key]}>
              <input
                className="field"
                inputMode={key === 'due_days' ? 'numeric' : undefined}
                value={values[key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...(v ?? {}), [key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saveMut.busy}>
            {saveMut.busy ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Danh mục khoản thu</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Đổi giá ở đây <b>không</b> ảnh hưởng hợp đồng đang chạy — chỉ dùng để prefill khi tạo hợp
            đồng mới. Muốn tăng giá khách hiện tại thì sửa trong hợp đồng.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2 text-left">Khoản</th>
              <th className="px-4 py-2 text-left">Cách tính</th>
              <th className="px-4 py-2 text-left">Đơn vị</th>
              <th className="px-4 py-2 text-right">Giá mặc định</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.data.rows.map((item) => (
              <ServiceRow key={item.id} item={item} onSave={saveItem} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ServiceRow({
  item,
  onSave,
}: {
  item: ServiceItem
  onSave: (item: ServiceItem, price: string) => void
}) {
  const [price, setPrice] = useState(String(item.default_price))
  const dirty = Number(price) !== item.default_price

  return (
    <tr>
      <td className="px-4 py-2">
        <div className="font-medium text-slate-800">{item.name}</div>
        {!item.is_service && (
          <div className="text-[11px] text-slate-400">lưu ở hợp đồng, không vào bảng giá dịch vụ</div>
        )}
      </td>
      <td className="px-4 py-2 text-slate-600">{PRICING_MODE_LABEL[item.pricing_mode]}</td>
      <td className="px-4 py-2 text-slate-500">{item.unit_label || '—'}</td>
      <td className="px-4 py-2 text-right">
        {item.is_service ? (
          <input
            className="num-input w-32"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        ) : (
          <span className="text-slate-400">theo hợp đồng</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {dirty && item.is_service && (
          <button
            className="text-xs font-medium text-sky-700 hover:underline"
            onClick={() => onSave(item, price)}
          >
            lưu ({money(price)})
          </button>
        )}
      </td>
    </tr>
  )
}
