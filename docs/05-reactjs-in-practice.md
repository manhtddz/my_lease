# ReactJS trong dự án nhà trọ — lý thuyết & trích dẫn thực tế

> Tổng hợp các khái niệm React (cơ bản → nâng cao) **thực sự được áp dụng** trong `frontend/`.
> Mỗi mục gồm: lý thuyết ngắn → code thật trong dự án → vì sao viết như vậy.
>
> Stack: React 19.2 · react-dom 19.2 · react-router-dom 7 · TypeScript · Vite 8 · Tailwind 4
> (`frontend/package.json`)

---

## Mục lục

**Phần A — Cơ bản**
1. [JSX & rendering](#1-jsx--rendering)
2. [Component & Props](#2-component--props)
3. [Composition qua `children`](#3-composition-qua-children)
4. [Conditional rendering](#4-conditional-rendering)
5. [List rendering & `key`](#5-list-rendering--key)
6. [State với `useState`](#6-state-với-usestate)
7. [Event handling](#7-event-handling)
8. [Controlled components (form)](#8-controlled-components-form)
9. [Lifting state up](#9-lifting-state-up)

**Phần B — Trung cấp**
10. [Derived state — tính toán khi render](#10-derived-state--tính-toán-khi-render)
11. [Immutable state update](#11-immutable-state-update)
12. [Functional updater](#12-functional-updater)
13. [Lazy initial state](#13-lazy-initial-state)
14. [`useEffect` + cleanup](#14-useeffect--cleanup)
15. [`useRef` — giá trị ngoài render](#15-useref--giá-trị-ngoài-render)
16. [Custom hook](#16-custom-hook)
17. [Client-side routing](#17-client-side-routing)
18. [URL là state](#18-url-là-state)

**Phần C — Nâng cao**
19. [Context API](#19-context-api)
20. [Provider pattern + render vào cuối cây](#20-provider-pattern--render-vào-cuối-cây)
21. [Promise-based imperative UI](#21-promise-based-imperative-ui)
22. [`useMemo` & referential stability](#22-usememo--referential-stability)
23. [`useCallback`](#23-usecallback)
24. [`StrictMode` & double-invoke](#24-strictmode--double-invoke)
25. [Early return trước hooks — cạm bẫy Rules of Hooks](#25-early-return-trước-hooks--cạm-bẫy-rules-of-hooks)
26. [TypeScript + React](#26-typescript--react)
27. [Những gì dự án **cố ý không dùng**](#27-những-gì-dự-án-cố-ý-không-dùng)

---

# Phần A — Cơ bản

## 1. JSX & rendering

**Lý thuyết.** JSX là cú pháp mô tả UI, được compile thành `React.createElement(...)`. React 19 + `@vitejs/plugin-react` dùng *automatic JSX runtime* — không cần `import React` trong mỗi file.

**Trong dự án.** Không file `.tsx` nào import `React` mặc định; chỉ import hook cần dùng:

```tsx
// frontend/src/pages/Dashboard.tsx:1
import { useState } from 'react'
```

Entry point dùng API root của React 18+ (`createRoot`), không phải `ReactDOM.render`:

```tsx
// frontend/src/main.tsx:6-16
const container = document.getElementById('root')
if (!container) {
  throw new Error('Không tìm thấy #root trong index.html')
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

> **Ghi chú:** guard clause `if (!container) throw` là áp dụng quy tắc "xử lý lỗi ở đầu function" của dự án — đồng thời thu hẹp kiểu `HTMLElement | null` → `HTMLElement` cho TypeScript.

📎 [main.tsx](../frontend/src/main.tsx)

---

## 2. Component & Props

**Lý thuyết.** Component là hàm nhận `props` (read-only) và trả JSX. Props chảy một chiều: cha → con.

**Trong dự án.** Toàn bộ là function component, không có class component nào.

```tsx
// frontend/src/components/ui.tsx:13-20
export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
      {label}
    </div>
  )
}
```

Destructuring props + **default parameter** (`label = 'Đang tải…'`) — cách đặt giá trị mặc định chuẩn cho function component.

Props phức tạp hơn được đặt tên qua interface:

```tsx
// frontend/src/components/ui.tsx:93-101
export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
```

📎 [ui.tsx](../frontend/src/components/ui.tsx)

---

## 3. Composition qua `children`

**Lý thuyết.** Thay vì kế thừa, React dùng **composition**: component bọc ngoài nhận `children` và quyết định *chỗ* render, không quyết định *nội dung*.

**Trong dự án.** `Layout` là ví dụ kinh điển — header + nav cố định, phần thân do route quyết định:

```tsx
// frontend/src/App.tsx:34-63
function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 …">…</header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
```

`Field` gom nhãn + ô nhập + lỗi mà không cần biết bên trong là `<input>`, `<select>` hay gì khác:

```tsx
// frontend/src/components/ui.tsx:58-69
export function Field({ label, error, hint, children, className = '' }: FieldProps) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <div className={error ? '[&_input]:border-rose-400 [&_select]:border-rose-400' : ''}>
        {children}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      <FieldError error={error} />
    </div>
  )
}
```

**Wrapper component** — `MoveIn.tsx` bọc lại `Field` dùng chung để thêm tiện ích `span` mà không sửa component gốc:

```tsx
// frontend/src/pages/MoveIn.tsx:613-631
function Field({ label, children, span, error, hint }: {…}) {
  return (
    <FormField label={label} error={error} hint={hint} className={span ? 'sm:col-span-2' : ''}>
      {children}
    </FormField>
  )
}
```

📎 [App.tsx](../frontend/src/App.tsx) · [MoveIn.tsx](../frontend/src/pages/MoveIn.tsx)

---

## 4. Conditional rendering

**Lý thuyết.** Ba kỹ thuật: `&&`, ternary, và **early return `null`**.

**Trong dự án — early return để "không render gì":**

```tsx
// frontend/src/components/ui.tsx:22-24
export function ErrorBox({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  if (!error) return null
```

```tsx
// frontend/src/components/ui.tsx:101-102
export function Modal({ open, … }: ModalProps) {
  if (!open) return null
```

Modal **không render DOM khi đóng** → không cần CSS `display:none`, và state bên trong bị unmount sạch.

**Guard chuỗi loading → error → empty** (pattern lặp lại ở mọi page):

```tsx
// frontend/src/pages/Invoices.tsx:43-45
if (loading) return <Spinner />
if (error) return <ErrorBox error={error} onRetry={reload} />
if (!data) return null
```

Sau 3 dòng này, TypeScript đã narrow `data` về non-null — phần render bên dưới không cần `?.` nữa.

**Ternary lồng + `&&`** trong bảng:

```tsx
// frontend/src/pages/Readings.tsx:379-393
{locked ? (
  <Badge tone="slate">đã chốt</Badge>
) : computed ? (
  <span className={computed.warnings.length ? 'font-semibold text-amber-700' : '…'}>
    {num(computed.consumption)}
    {computed.warnings.length > 0 && ' ⚠'}
  </span>
) : (
  <span className="text-slate-300">—</span>
)}
```

📎 [Readings.tsx](../frontend/src/pages/Readings.tsx)

---

## 5. List rendering & `key`

**Lý thuyết.** `key` giúp React khớp phần tử cũ–mới giữa các lần render. Dùng **ID ổn định**; `index` chỉ chấp nhận được khi danh sách không sắp xếp lại / không xoá giữa chừng.

**Trong dự án — key theo ID nghiệp vụ:**

```tsx
// frontend/src/pages/Invoices.tsx:156-157
{rows.map((r) => (
  <tr key={r.id} className="hover:bg-slate-50">
```

```tsx
// frontend/src/pages/Dashboard.tsx:101-103
{list.map((room) => (
  <RoomCard key={room.id} room={room} />
))}
```

```tsx
// frontend/src/App.tsx:43-44
{NAV.map((item) => (
  <NavLink key={item.to} …>
```

**Key theo index — dùng có chủ đích** cho danh sách text thuần chỉ-đọc, không reorder:

```tsx
// frontend/src/components/confirm.tsx:76-78
{state.details.map((line, i) => (
  <li key={i}>{line}</li>
))}
```

```tsx
// frontend/src/pages/Readings.tsx:286-288
{allErrors.map((e, i) => (
  <li key={i}>{e}</li>
))}
```

> ⚠️ Điểm cần lưu ý: `MoveIn.tsx:357-358` dùng `key={i}` cho danh sách người ở ghép **có nút xoá** (`MoveIn.tsx:400-405`). Xoá phần tử giữa danh sách sẽ làm React tái sử dụng sai DOM node. Đây là chỗ nên đổi sang ID sinh sẵn nếu form phức tạp hơn.

📎 [confirm.tsx](../frontend/src/components/confirm.tsx)

---

## 6. State với `useState`

**Lý thuyết.** `useState` khai báo state cục bộ; setState là **bất đồng bộ** và trigger re-render.

**Trong dự án — chia nhỏ state theo mục đích thay vì một object khổng lồ:**

```tsx
// frontend/src/components/PaymentModal.tsx:30-36
const [amount, setAmount] = useState('')
const [paidAt, setPaidAt] = useState<string>(todayISO())
const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.Cash)
const [refNo, setRefNo] = useState('')
const [errors, setErrors] = useState<Errors<PaymentField>>({})
const [busy, setBusy] = useState(false)
```

**State dạng map** khi số lượng field động (12 ô nhập chỉ số):

```tsx
// frontend/src/pages/Readings.tsx:41-43
const [values, setValues] = useState<Record<number, string>>({})
const [changed, setChanged] = useState<Record<number, boolean>>({})
const [saving, setSaving] = useState(false)
```

**Một object khi các field luôn thay đổi cùng nhau** (form wizard):

```tsx
// frontend/src/pages/MoveIn.tsx:73-76
const [step, setStep] = useState(0)
const [saving, setSaving] = useState(false)
const [form, setForm] = useState<MoveInForm | null>(null)
const [errors, setErrors] = useState<Record<string, string>>({})
```

**`busy` / `saving` state** — pattern chống double-submit, xuất hiện ở mọi màn hình có thao tác ghi:

```tsx
// frontend/src/components/PaymentModal.tsx:131-133
<button className="btn-primary" onClick={submit} disabled={busy}>
  {busy ? 'Đang lưu…' : 'Lưu'}
</button>
```

📎 [PaymentModal.tsx](../frontend/src/components/PaymentModal.tsx)

---

## 7. Event handling

**Lý thuyết.** React dùng SyntheticEvent, handler đặt qua prop `onXxx`, nhận camelCase.

**Trong dự án — inline arrow cho handler ngắn:**

```tsx
// frontend/src/pages/Dashboard.tsx:59-61
<button className="btn-ghost px-2 py-1" onClick={() => setViewPeriod(prevPeriod(viewPeriod))}>
  ‹
</button>
```

**Named function cho handler có logic** — đặt trong body component, gọi được state & props:

```tsx
// frontend/src/pages/Invoices.tsx:77-96
async function issueOne(invoice: Invoice) {
  const agreed = await confirm({ … })
  if (!agreed) return
  setBusy(true)
  try {
    await api.issueInvoice(invoice.id)
    toast.success(`Đã phát hành ${invoice.code}.`)
    reload()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    setBusy(false)
  }
}
```

**Async event handler** — React cho phép `onClick={async …}`; `finally` đảm bảo `busy` luôn được nhả kể cả khi lỗi.

**Handler như prop (callback đi xuống)** — con báo lên cha:

```tsx
// frontend/src/pages/Readings.tsx:243-249
onChange={(v) => electric && setValues((s) => ({ ...s, [electric.meter_id]: v }))}
onToggleChanged={() =>
  electric && setChanged((s) => ({ ...s, [electric.meter_id]: !s[electric.meter_id] }))
}
```

---

## 8. Controlled components (form)

**Lý thuyết.** Input *controlled* = giá trị do React state quyết định (`value` + `onChange`). React là single source of truth, DOM chỉ phản chiếu.

**Trong dự án.** 100% input là controlled — không có `defaultValue`, không có `ref` để đọc giá trị.

```tsx
// frontend/src/components/PaymentModal.tsx:96-101
<input
  className="field text-right tabular-nums"
  inputMode="numeric"
  value={amount}
  onChange={(e) => setAmount(e.target.value)}
/>
```

**Số được giữ dạng `string` trong state** — quyết định thiết kế rõ ràng, có comment giải thích:

```ts
// frontend/src/pages/MoveIn.tsx:32-36
/** Khoản dịch vụ trong form — giá giữ dạng chuỗi vì đến từ input. */
interface ServiceRow extends Omit<ServiceDefault, 'unit_price'> {
  unit_price: string
  quantity_fixed?: string
}
```

Lý do: `Number('')` = `0` và `Number('12.')` = `12` sẽ phá trải nghiệm gõ. Chuyển sang `Number(...)` chỉ tại biên submit:

```tsx
// frontend/src/pages/MoveIn.tsx:243-247
rent_amount: Number(form.rent_amount),
deposit_amount: Number(form.deposit_amount),
occupant_count: Number(form.occupant_count),
```

**Select controlled + enum:**

```tsx
// frontend/src/components/PaymentModal.tsx:109-117
<select className="field" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
  <option value={PaymentMethod.Cash}>Tiền mặt</option>
  <option value={PaymentMethod.Transfer}>Chuyển khoản</option>
  <option value={PaymentMethod.Other}>Khác</option>
</select>
```

**Checkbox controlled:**

```tsx
// frontend/src/pages/Readings.tsx:374
<input type="checkbox" checked={changed} onChange={onToggleChanged} />
```

**Field hiện có điều kiện** — mã giao dịch chỉ bắt buộc khi chuyển khoản:

```tsx
// frontend/src/components/PaymentModal.tsx:121-125
{method === PaymentMethod.Transfer && (
  <Field label="Mã giao dịch" error={errors.ref_no}>
    <input className="field" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
  </Field>
)}
```

…và validate cũng có điều kiện tương ứng:

```ts
// frontend/src/components/PaymentModal.tsx:57
ref_no: method === PaymentMethod.Transfer ? check('ref_no', refNo, [required]) : null,
```

---

## 9. Lifting state up

**Lý thuyết.** Khi hai component cần chung một dữ liệu, đẩy state lên **cha chung gần nhất**, truyền xuống bằng props + callback.

**Trong dự án.** `MeterCells` hoàn toàn **không có state riêng** — nó nhận `value` / `computed` / `changed` và bắn `onChange` / `onToggleChanged` lên `Readings`:

```tsx
// frontend/src/pages/Readings.tsx:337-346
interface MeterCellsProps {
  meter: SheetMeter | undefined
  value: string
  computed: ComputedCell | undefined
  changed: boolean
  onChange: (value: string) => void
  onToggleChanged: () => void
}

function MeterCells({ meter, value, computed, changed, onChange, onToggleChanged }: MeterCellsProps) {
```

Nhờ vậy `Readings` mới tính được tổng hợp toàn bảng (`filled`, `allWarnings`, `allErrors`) và validate cả bảng trước khi lưu.

**`PaymentModal` cũng là component "không sở hữu" dữ liệu hoá đơn** — cha điều khiển bằng cách truyền `invoice` (null = đóng):

```tsx
// frontend/src/pages/Invoices.tsx:217-231
<PaymentModal
  invoice={payTarget}
  onClose={() => setPayTarget(null)}
  onSubmit={async (payload) => { … }}
/>
```

```ts
// frontend/src/components/PaymentModal.tsx:17-22
export interface PaymentModalProps {
  /** null = đóng modal. */
  invoice: PayableInvoice | null
  onClose: () => void
  onSubmit: (payload: PaymentPayload) => Promise<void> | void
}
```

> **Structural typing.** `PayableInvoice` chỉ khai báo vài field cần thiết, nên cùng một modal nhận được cả `Invoice` đầy đủ (từ `InvoiceDetail`) lẫn dòng danh sách (từ `Invoices`) — không cần adapter.

---

# Phần B — Trung cấp

## 10. Derived state — tính toán khi render

**Lý thuyết.** Nguyên tắc quan trọng nhất về state React: **cái gì tính được từ state/props thì đừng lưu thành state**. Lưu thừa → hai nguồn sự thật → lệch nhau.

**Trong dự án — tính thẳng trong body component:**

```tsx
// frontend/src/pages/Invoices.tsx:47-49
const rows = data.rows
const drafts = rows.filter((r) => r.status === InvoiceStatus.Draft)
const totalDue = rows.reduce((s, r) => s + Math.max(0, r.remaining), 0)
```

```tsx
// frontend/src/pages/Readings.tsx:115-118
const filled = Object.values(values).filter((v) => v !== '' && v !== undefined).length
const totalMeters = rows.reduce((sum, r) => sum + (r.blocked ? 0 : r.meters.length), 0)
const allWarnings = Object.values(computed).flatMap((c) => c.warnings)
const allErrors = Object.values(computed).flatMap((c) => c.errors)
```

```tsx
// frontend/src/pages/InvoiceDetail.tsx:54-61
const { invoice, details, payments, owner } = data
const isDraft = invoice.status === InvoiceStatus.Draft
const isVoid = invoice.status === InvoiceStatus.Void

const draftSubtotal = draftLines.reduce(
  (sum, l) => sum + Math.round((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)),
  0,
)
```

`draftSubtotal` tính lại mỗi render → tổng tiền trên màn hình **không bao giờ lệch** với các ô đang gõ.

**Grouping cũng là derived:**

```tsx
// frontend/src/pages/Dashboard.tsx:49-52
const groups = rooms.reduce<Record<string, DashboardRoom[]>>((acc, room) => {
  ;(acc[room.building_name] ??= []).push(room)
  return acc
}, {})
```

**"Dirty check" tính tại thời điểm cần**, không nuôi state `isDirty`:

```tsx
// frontend/src/pages/InvoiceDetail.tsx:169-173
const dirty = draftLines.some((line) => {
  const original = details.find((d) => d.id === line.id)
  if (!original) return false
  return Number(line.quantity) !== original.quantity || Number(line.unit_price) !== original.unit_price
})
```

---

## 11. Immutable state update

**Lý thuyết.** React so sánh state bằng `Object.is`. Mutate tại chỗ (`arr.push`, `obj.x = 1`) → tham chiếu không đổi → **không re-render**. Luôn tạo object/array mới.

**Trong dự án — spread object:**

```tsx
// frontend/src/pages/MoveIn.tsx:117-119
function patch(next: Partial<MoveInForm>) {
  setForm((f) => (f ? { ...f, ...next } : f))
}
```

Đây là **partial-update helper** — pattern rất gọn cho form lớn: `patch({ rent_amount: e.target.value })`.

**Spread lồng cho nested object:**

```tsx
// frontend/src/pages/MoveIn.tsx:306
onChange={(e) => patch({ tenant: { ...form.tenant, full_name: e.target.value } })}
```

**`map` thay vì mutate phần tử mảng:**

```tsx
// frontend/src/pages/InvoiceDetail.tsx:71-73
function patchLine(lineId: number, key: 'quantity' | 'unit_price', value: string) {
  setDraftLines((lines) => lines.map((l) => (l.id === lineId ? { ...l, [key]: value } : l)))
}
```

**Computed key** (`[key]: value`) cho phép một hàm sửa nhiều field — vẫn type-safe nhờ union `'quantity' | 'unit_price'`.

**`filter` để xoá, spread để thêm:**

```tsx
// frontend/src/pages/MoveIn.tsx:402
onClick={() => patch({ occupants: form.occupants.filter((_, j) => j !== i) })}
```

```tsx
// frontend/src/pages/MoveIn.tsx:411-416
onClick={() =>
  patch({
    occupants: [...form.occupants, { full_name: '', id_card_no: '', relationship: '' }],
    occupant_count: String(form.occupants.length + 2),
  })
}
```

**Copy mảng trước khi gán index:**

```tsx
// frontend/src/pages/MoveIn.tsx:364-368
onChange={(e) => {
  const next = [...form.occupants]
  next[i] = { ...occupant, full_name: e.target.value }
  patch({ occupants: next })
}}
```

**Chuyển phần tử giữa hai mảng — vẫn thuần immutable:**

```tsx
// frontend/src/pages/MoveIn.tsx:121-140
function toggleService(serviceItemId: number) {
  const inActive = form.services.find((s) => s.service_item_id === serviceItemId)
  if (inActive) {
    patch({
      services: form.services.filter((s) => s.service_item_id !== serviceItemId),
      disabledServices: [...form.disabledServices, inActive],
    })
    return
  }
  …
}
```

---

## 12. Functional updater

**Lý thuyết.** `setX(prev => next)` đọc giá trị mới nhất, tránh **stale closure** khi nhiều update nối nhau trong cùng một tick hoặc trong callback bất đồng bộ.

**Trong dự án:**

```ts
// frontend/src/lib/useApi.ts:21
const reload = useCallback(() => setTick((t) => t + 1), [])
```

`useCallback` với deps rỗng chỉ đúng **vì** dùng functional updater — không đóng gói giá trị `tick` cũ.

```tsx
// frontend/src/components/ui.tsx:150-154
const push = useCallback((message: string, tone: ToastTone = 'green') => {
  const id = Math.random().toString(36).slice(2)
  setItems((prev) => [...prev, { id, message, tone }])
  setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200)
}, [])
```

Đây là ví dụ **bắt buộc** phải dùng functional updater: callback của `setTimeout` chạy 4.2 giây sau, khi đó `items` trong closure đã cũ. `prev => prev.filter(...)` luôn thao tác trên danh sách hiện tại → nhiều toast chồng nhau vẫn xoá đúng cái của mình.

```tsx
// frontend/src/pages/Readings.tsx:244
setValues((s) => ({ ...s, [electric.meter_id]: v }))
```

```tsx
// frontend/src/pages/MoveIn.tsx:205
setStep((s) => s + 1)
```

---

## 13. Lazy initial state

**Lý thuyết.** `useState(expensiveCall())` chạy hàm ở **mọi** lần render (kết quả bị bỏ đi). `useState(() => expensiveCall())` chỉ chạy lần mount đầu tiên.

**Trong dự án — truyền trực tiếp function reference:**

```tsx
// frontend/src/pages/Dashboard.tsx:38
const [viewPeriod, setViewPeriod] = useState<PeriodYm>(currentPeriod)
```

Chú ý: `currentPeriod` **không có dấu ngoặc** — React tự gọi một lần.

**Lazy initializer có logic:**

```tsx
// frontend/src/pages/Readings.tsx:39
const [viewPeriod, setViewPeriod] = useState<PeriodYm>(() => params.get('period') ?? currentPeriod())
```

Đọc query param làm giá trị khởi tạo, nhưng sau đó state tự do — người dùng đổi kỳ không cần đụng URL.

> So sánh: ở `PaymentModal.tsx:32` dùng `useState<string>(todayISO())` (gọi luôn). Chấp nhận được vì `todayISO()` rẻ và modal được mount/unmount liên tục.

---

## 14. `useEffect` + cleanup

**Lý thuyết.** Effect chạy **sau** render, dùng để đồng bộ với hệ thống bên ngoài (network, timer, DOM API). Hàm trả về là **cleanup**, chạy trước effect kế tiếp và khi unmount.

**Trong dự án — chỉ có 2 chỗ dùng `useEffect`, cả hai đều chính đáng.**

**(a) Fetch + chống race condition:**

```ts
// frontend/src/lib/useApi.ts:23-43
useEffect(() => {
  let alive = true
  setLoading(true)
  setError(null)

  fetcher()
    .then((result) => {
      if (alive) setData(result)
    })
    .catch((err: unknown) => {
      if (alive) setError(err instanceof Error ? err : new Error(String(err)))
    })
    .finally(() => {
      if (alive) setLoading(false)
    })

  return () => {
    alive = false
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [...deps, tick])
```

Cờ `alive` là pattern kinh điển: người dùng bấm nhanh kỳ 07 → 08 → 09, response của 07 về muộn nhất cũng **không** ghi đè dữ liệu của 09.

`// eslint-disable-next-line react-hooks/exhaustive-deps` là **đánh đổi có ý thức**: `fetcher` là arrow function mới ở mỗi render nên không thể nằm trong deps; hợp đồng của hook là "caller tự khai `deps`".

**(b) Đồng bộ props → state (prefill form):**

```tsx
// frontend/src/components/PaymentModal.tsx:38-49
const invoiceId = invoice?.id
const remaining = invoice?.remaining

// Mở hoá đơn nào thì prefill đúng số nợ của hoá đơn đó — trường hợp
// thường gặp nhất là khách trả đủ.
useEffect(() => {
  if (invoiceId !== undefined) {
    setAmount(String(remaining))
    setErrors({})
    setBusy(false)
  }
}, [invoiceId, remaining])
```

Trích `invoiceId` / `remaining` ra biến **primitive** trước khi cho vào deps — nếu để `[invoice]` thì object mới ở mỗi render của cha sẽ khiến effect chạy liên tục và ghi đè số tiền người dùng đang gõ.

---

## 15. `useRef` — giá trị ngoài render

**Lý thuyết.** `useRef` giữ giá trị **mutable, không trigger re-render**. Dùng cho: DOM node, timer id, và giá trị "instance" cần bền qua các render.

**Trong dự án — giữ `resolve` của Promise:**

```tsx
// frontend/src/components/confirm.tsx:39-40
const [state, setState] = useState<ConfirmState | null>(null)
const resolver = useRef<((value: boolean) => void) | null>(null)
```

```tsx
// frontend/src/components/confirm.tsx:52-61
return new Promise<boolean>((resolve) => {
  resolver.current = resolve
})
…
function close(result: boolean) {
  resolver.current?.(result)
  resolver.current = null
  setState(null)
}
```

Đây đúng là use-case của `useRef`: hàm `resolve` **không thuộc về UI** — gán nó không được gây re-render, và nó phải sống sót qua nhiều render giữa lúc mở dialog và lúc người dùng bấm nút.

> Nếu dùng `useState(resolve)` sẽ vừa thừa một render vừa vướng lỗi kinh điển "setState với function bị hiểu nhầm là functional updater".

---

## 16. Custom hook

**Lý thuyết.** Custom hook = hàm bắt đầu bằng `use`, gọi hook khác, tái sử dụng **logic có state** (không tái sử dụng UI).

**Trong dự án — `useApi` là xương sống của mọi màn hình:**

```ts
// frontend/src/lib/useApi.ts:3-15
export interface UseApiResult<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
  setData: (value: T | null) => void
}

/**
 * Fetch tối giản: không dùng thư viện query vì app chỉ có 1 người dùng,
 * không cần cache chia sẻ hay revalidate nền.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseApiResult<T> {
```

**Generic hook** — `T` suy ra từ kiểu trả về của `fetcher`, nên `data` có kiểu chính xác tại nơi gọi mà không cần annotate:

```tsx
// frontend/src/pages/InvoiceDetail.tsx:48
const { data, error, loading, reload } = useApi(() => api.invoice(id!), [id])
```

**Deps chính là "khi nào fetch lại"** — đổi filter là tự động refetch:

```tsx
// frontend/src/pages/Invoices.tsx:23-31
const { data, error, loading, reload } = useApi(
  () =>
    api.invoices({
      period: periodFilter || undefined,
      status: statusFilter || undefined,
      room_id: roomFilter || undefined,
    }),
  [periodFilter, statusFilter, roomFilter],
)
```

**Side-effect trong `fetcher`** — kỹ thuật nâng cao dùng để seed form state ngay khi dữ liệu về, tránh phải thêm một `useEffect` nữa:

```tsx
// frontend/src/pages/Readings.tsx:45-60
const { data, error, loading, reload } = useApi(
  () =>
    api.readingSheet(viewPeriod).then((res) => {
      setReadDate(res.default_read_date)
      const initial: Record<number, string> = {}
      res.rows.forEach((row) =>
        row.meters.forEach((m) => {
          if (m.existing) initial[m.meter_id] = String(m.existing.reading)
        }),
      )
      setValues(initial)
      setChanged({})
      return res
    }),
  [viewPeriod],
)
```

Cùng pattern ở `MoveIn.tsx:78-107` để dựng cả `MoveInForm` từ defaults của backend.

**Custom hook thứ hai & ba** là các consumer của Context — xem mục 19.

---

## 17. Client-side routing

**Lý thuyết.** SPA routing: URL đổi nhưng không reload trang; router chọn component để render.

**Trong dự án — react-router v7, khai báo tập trung:**

```tsx
// frontend/src/App.tsx:69-87
<BrowserRouter>
  <Layout>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/readings" element={<Readings />} />
      <Route path="/billing" element={<Billing />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/invoices/:id" element={<InvoiceDetail />} />
      <Route path="/contracts" element={<Contracts />} />
      <Route path="/contracts/move-in/:roomId" element={<MoveIn />} />
      <Route path="/contracts/:id/move-out" element={<MoveOut />} />
      …
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Layout>
</BrowserRouter>
```

`<Navigate to="/" replace />` cho `path="*"` — catch-all, `replace` để URL sai không nằm lại trong lịch sử back.

**Route params typed:**

```tsx
// frontend/src/pages/InvoiceDetail.tsx:36
const { id } = useParams<{ id: string }>()
```

```tsx
// frontend/src/pages/MoveIn.tsx:68
const { roomId } = useParams<{ roomId: string }>()
```

**Điều hướng có lập trình** sau khi thao tác thành công:

```tsx
// frontend/src/pages/MoveIn.tsx:261-262
toast.success(`Đã tạo hợp đồng ${result.code}.`)
navigate('/')
```

**`NavLink` + render-prop `className`** — router truyền `isActive` vào:

```tsx
// frontend/src/App.tsx:44-56
<NavLink
  key={item.to}
  to={item.to}
  end={item.end}
  className={({ isActive }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-100'
    }`
  }
>
```

`end: true` cho route `/` để nó không "active" ở mọi trang con (`App.tsx:24`).

**`Link` thay cho `<a>`** — điều hướng không reload:

```tsx
// frontend/src/pages/Dashboard.tsx:151-153
<Link to={`/invoices?room_id=${room.id}`} className="btn-primary flex-1 px-2 py-1 text-xs">
  Thu nợ
</Link>
```

---

## 18. URL là state

**Lý thuyết.** Với filter/tab/period, đặt state **trong URL** thay vì `useState`: chia sẻ link được, back/forward hoạt động, refresh không mất ngữ cảnh.

**Trong dự án — `useSearchParams` là nguồn sự thật của bộ lọc:**

```tsx
// frontend/src/pages/Invoices.tsx:12-19
const [params, setParams] = useSearchParams()
…
const periodFilter = params.get('period') ?? ''
const statusFilter = params.get('status') ?? ''
const roomFilter = params.get('room_id') ?? ''
```

Không có `useState` nào cho filter. Update qua helper:

```tsx
// frontend/src/pages/Invoices.tsx:33-41
function setFilter(key: string, value: string) {
  const next = new URLSearchParams(params)
  if (value) {
    next.set(key, value)
  } else {
    next.delete(key)
  }
  setParams(next)
}
```

Copy `URLSearchParams` rồi set — **immutable update** áp dụng cho cả URL state.

Vì `periodFilter` nằm trong deps của `useApi` (`Invoices.tsx:30`), bấm Back trên trình duyệt cũng tự refetch đúng dữ liệu — không cần viết thêm dòng nào.

**Điều hướng có mang state:**

```tsx
// frontend/src/pages/Dashboard.tsx:31-35
const ACTION_ROUTE: Record<BannerAction, (p: PeriodYm) => string> = {
  read: (p) => `/readings?period=${p}`,
  billing: (p) => `/billing?period=${p}`,
  invoices: (p) => `/invoices?period=${p}`,
}
```

…và bên nhận đọc nó làm giá trị khởi tạo (`Readings.tsx:39`).

---

# Phần C — Nâng cao

## 19. Context API

**Lý thuyết.** Context tránh **prop drilling** cho dữ liệu "toàn cục theo cây": theme, i18n, auth, và ở đây là **dịch vụ UI** (toast, confirm).

**Trong dự án — Context #1: Toast**

```tsx
// frontend/src/components/ui.tsx:131-139
export interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const NOOP_TOAST: ToastApi = { success: () => {}, error: () => {}, info: () => {} }

const ToastCtx = createContext<ToastApi>(NOOP_TOAST)
```

```tsx
// frontend/src/components/ui.tsx:179-181
export function useToast(): ToastApi {
  return useContext(ToastCtx)
}
```

**Context #2: Confirm**

```tsx
// frontend/src/components/confirm.tsx:24-27
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

/** Mặc định đồng ý — chỉ xảy ra khi component nằm ngoài provider. */
const ConfirmCtx = createContext<ConfirmFn>(async () => true)
```

**Ba điểm đáng học ở đây:**

1. **Context không export ra ngoài.** Chỉ `Provider` + hook `useToast` / `useConfirm` được export. Consumer không thể dùng sai API.
2. **Default value có ý nghĩa.** `NOOP_TOAST` và `async () => true` khiến component vẫn chạy được khi nằm ngoài provider (ví dụ trong test) thay vì crash vì `undefined`.
3. **Kiểu context là "API", không phải "state".** Giá trị context là 3 hàm — nội dung toast (state `items`) **không** nằm trong context, nên component gọi `useToast()` không re-render mỗi khi có toast mới. Đây là kỹ thuật tối ưu Context quan trọng nhất.

**Cách dùng — gọn tới mức như built-in:**

```tsx
// frontend/src/pages/Invoices.tsx:13-14
const toast = useToast()
const confirm = useConfirm()
```

---

## 20. Provider pattern + render vào cuối cây

**Lý thuyết.** Provider component vừa cấp value, vừa **tự render UI phụ trợ** cạnh `children`.

**Trong dự án:**

```tsx
// frontend/src/components/ui.tsx:165-176
return (
  <ToastCtx.Provider value={value}>
    {children}
    <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={`card px-4 py-3 text-sm shadow-lg ${TOAST_CLASS[t.tone]}`}>
          <div className="whitespace-pre-line">{t.message}</div>
        </div>
      ))}
    </div>
  </ToastCtx.Provider>
)
```

```tsx
// frontend/src/components/confirm.tsx:63-93
return (
  <ConfirmCtx.Provider value={confirm}>
    {children}
    <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
      {state && ( … )}
    </Modal>
  </ConfirmCtx.Provider>
)
```

Chỉ có **một** modal xác nhận và **một** toast container trong toàn app, đặt cuối DOM — không cần React Portal vì đã dùng `position: fixed` + `z-index` (`ui.tsx:168`, `ui.tsx:104`).

**Thứ tự lồng provider có ý nghĩa:**

```tsx
// frontend/src/App.tsx:66-89
<ToastProvider>
  <ConfirmProvider>
    <BrowserRouter>
      <Layout>…</Layout>
    </BrowserRouter>
  </ConfirmProvider>
</ToastProvider>
```

`ToastProvider` ngoài cùng → `ConfirmProvider` (và mọi thứ bên trong) đều gọi được `useToast()`. Router nằm trong cùng để toast/confirm **không bị unmount khi đổi route** — toast báo "Đã tạo hợp đồng" vẫn hiển thị sau khi `navigate('/')` ở `MoveIn.tsx:262`.

---

## 21. Promise-based imperative UI

**Lý thuyết.** Dialog vốn là *imperative* (`window.confirm`), còn React là *declarative*. Cầu nối: provider giữ `resolve` trong ref, trả Promise cho caller — code gọi viết tuyến tính như `await`.

**Trong dự án — toàn bộ cơ chế:**

```tsx
// frontend/src/components/confirm.tsx:42-61
const confirm = useCallback<ConfirmFn>((options) => {
  setState({
    title: options.title ?? 'Xác nhận',
    message: options.message ?? '',
    details: options.details ?? null,
    confirmLabel: options.confirmLabel ?? 'Đồng ý',
    cancelLabel: options.cancelLabel ?? 'Huỷ',
    tone: options.tone ?? 'primary',
  })

  return new Promise<boolean>((resolve) => {
    resolver.current = resolve
  })
}, [])

function close(result: boolean) {
  resolver.current?.(result)
  resolver.current = null
  setState(null)
}
```

**Kết quả tại nơi dùng — đọc như code đồng bộ:**

```tsx
// frontend/src/components/PaymentModal.tsx:68-77
// Thu quá số nợ thường là gõ sai — hỏi lại nhưng vẫn cho phép (khách trả trước).
if (value > invoice.remaining) {
  const agreed = await confirm({
    title: 'Thu nhiều hơn số nợ?',
    message: `Số nợ còn ${moneyd(invoice.remaining)} nhưng bạn nhập ${moneyd(value)}, dư ${moneyd(value - invoice.remaining)}.`,
    details: ['Kiểm tra lại nếu chỉ định thu đủ.', 'Vẫn lưu được nếu khách trả trước cho kỳ sau.'],
    confirmLabel: 'Vẫn lưu',
  })
  if (!agreed) return
}
```

Không callback lồng nhau, không state `isConfirmOpen` ở mỗi màn hình. Pattern này lặp lại ở `Readings.tsx:127`, `Invoices.tsx:57`, `MoveIn.tsx:220`, `InvoiceDetail.tsx:126/176/190/204/234`.

**Type-driven defaults** — `Required<Omit<…>>` buộc mọi option phải có giá trị sau khi normalize:

```ts
// frontend/src/components/confirm.tsx:34-36
interface ConfirmState extends Required<Omit<ConfirmOptions, 'details'>> {
  details: string[] | null
}
```

**`autoFocus`** để bàn phím dùng được ngay:

```tsx
// frontend/src/components/confirm.tsx:86
<button className={TONE[state.tone].btn} onClick={() => close(true)} autoFocus>
```

---

## 22. `useMemo` & referential stability

**Lý thuyết.** `useMemo` cache kết quả theo deps. Chỉ dùng khi (a) tính toán thật sự nặng, hoặc (b) cần **tham chiếu ổn định** làm deps cho hook khác.

**Trong dự án — dùng rất tiết kiệm, chỉ 2 chỗ.**

**(a) Tính toán nặng — 12 ô nhập × validate + cảnh báo:**

```tsx
// frontend/src/pages/Readings.tsx:66-113
const computed = useMemo<Record<number, ComputedCell>>(() => {
  const out: Record<number, ComputedCell> = {}
  rows.forEach((row) =>
    row.meters.forEach((m) => {
      …
      const rolled = curr < m.prev_reading
      const consumption = changed[m.meter_id]
        ? curr
        : rolled
          ? 10 ** m.digits - m.prev_reading + curr
          : curr - m.prev_reading
      …
    }),
  )
  return out
}, [rows, values, changed])
```

**(b) Referential stability — bài học được ghi thẳng vào code:**

```tsx
// frontend/src/pages/Readings.tsx:25
const EMPTY_ROWS: SheetRow[] = []

// frontend/src/pages/Readings.tsx:62-64
// Hằng số ngoài render: `?? []` tạo mảng mới mỗi lần, làm useMemo bên dưới
// tính lại vô ích ở mọi lần render.
const rows = data?.rows ?? EMPTY_ROWS
```

Đây là chi tiết nâng cao đáng chú ý nhất của codebase. Nếu viết `data?.rows ?? []`, mỗi render sinh một mảng rỗng **mới** → `rows` đổi tham chiếu → `useMemo([rows, …])` invalidate → memo hoá vô tác dụng. Hằng số module-level `EMPTY_ROWS` giữ nguyên một tham chiếu duy nhất suốt vòng đời app.

**Memo hoá giá trị Context** — bắt buộc để consumer không re-render oan:

```tsx
// frontend/src/components/ui.tsx:156-163
const value = useMemo<ToastApi>(
  () => ({
    success: (m) => push(m, 'green'),
    error: (m) => push(m, 'rose'),
    info: (m) => push(m, 'sky'),
  }),
  [push],
)
```

Không có `useMemo` ở đây thì object `{success, error, info}` mới ở mỗi render của `ToastProvider` (mà provider re-render mỗi lần có toast) → **toàn bộ cây con** re-render theo. Kết hợp với `push` đã `useCallback` deps rỗng → `value` ổn định vĩnh viễn.

---

## 23. `useCallback`

**Lý thuyết.** Cache **định danh hàm** giữa các render. Chỉ có tác dụng khi hàm được truyền vào deps của hook khác, vào `React.memo`, hoặc vào context value.

**Trong dự án — cả 3 lần dùng đều có lý do rõ ràng:**

```ts
// frontend/src/lib/useApi.ts:21
const reload = useCallback(() => setTick((t) => t + 1), [])
```

`reload` được page truyền vào JSX (`onRetry={reload}`, `ErrorBox`) và gọi trong async handler — giữ nó ổn định để không tạo prop mới mỗi render.

```tsx
// frontend/src/components/ui.tsx:150-154
const push = useCallback((message, tone = 'green') => { … }, [])
```

→ deps của `useMemo` tạo context value (mục 22).

```tsx
// frontend/src/components/confirm.tsx:42-55
const confirm = useCallback<ConfirmFn>((options) => { … }, [])
```

`confirm` **chính là** context value (`confirm.tsx:64`), nên nó phải ổn định — nếu không, mỗi lần mở/đóng dialog (`setState`) sẽ đổi context value và re-render toàn app.

Ngược lại, `close` ở `confirm.tsx:57` là function thường (không memo) vì nó chỉ dùng nội bộ trong JSX của provider.

> **Nguyên tắc rút ra từ codebase:** dùng `useCallback`/`useMemo` khi có **người tiêu thụ tham chiếu**; những handler như `issueOne`, `saveEdits`, `patch`, `validateStep` đều là function thường — memo hoá chúng chỉ thêm rác mà không lợi ích.

---

## 24. `StrictMode` & double-invoke

**Lý thuyết.** Ở dev, `StrictMode` cố ý **gọi hai lần** render, initializer, và effect (mount → unmount → mount) để phơi bày side-effect không idempotent và cleanup thiếu.

**Trong dự án:**

```tsx
// frontend/src/main.tsx:12-16
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Code trong dự án **chịu được** double-invoke nhờ:

- `useApi` có cleanup `alive = false` (`useApi.ts:39-41`) → lần fetch bị huỷ ở mount đầu không set state.
- `push` của toast dùng functional updater (`ui.tsx:152-153`) → không phụ thuộc giá trị closure.
- Không có mutation ngoài React trong render — mọi tính toán trong body component đều thuần (mục 10).

---

## 25. Early return trước hooks — cạm bẫy Rules of Hooks

**Lý thuyết.** **Rules of Hooks**: hook phải được gọi ở top level, **cùng số lượng và cùng thứ tự** ở mọi render. Không gọi hook sau một `return` có điều kiện.

**Trong dự án — quy ước được tuân thủ nhất quán: gọi hết hook trước, rồi mới guard.**

```tsx
// frontend/src/pages/Invoices.tsx:12-45
const [params, setParams] = useSearchParams()   // ┐
const toast = useToast()                        // │ hook
const confirm = useConfirm()                    // │ zone
const [busy, setBusy] = useState(false)         // │
const [payTarget, setPayTarget] = useState<Invoice | null>(null)
…
const { data, error, loading, reload } = useApi(…)  // ┘

if (loading) return <Spinner />                 // ┐ guard
if (error) return <ErrorBox error={error} onRetry={reload} />  // │ zone
if (!data) return null                          // ┘
```

**Trường hợp tinh tế nhất — `PaymentModal`:**

```tsx
// frontend/src/components/PaymentModal.tsx:30-51
const [amount, setAmount] = useState('')
…
useEffect(() => { … }, [invoiceId, remaining])

if (!invoice) return null    // ← SAU tất cả hook
```

Nếu đảo lại (`if (!invoice) return null` lên đầu), số hook gọi sẽ thay đổi khi modal đóng/mở → React ném lỗi "Rendered fewer hooks than expected".

Hệ quả cần chú ý: `useEffect` vẫn chạy khi `invoice === null`, nên bên trong phải tự guard bằng `if (invoiceId !== undefined)` (`PaymentModal.tsx:44`).

**Tương tự ở `MoveIn`** — `form` là `null` cho tới khi API trả về, guard đặt sau `useApi`:

```tsx
// frontend/src/pages/MoveIn.tsx:109-111
if (loading || !form) return <Spinner />
if (error) return <ErrorBox error={error} onRetry={reload} />
if (!data) return null
```

---

## 26. TypeScript + React

**Lý thuyết.** TS giúp props/state/event tự tài liệu hoá và bắt lỗi tại compile time. Import kiểu bằng `import type` để bundler loại bỏ hoàn toàn.

**Trong dự án — `import type` nhất quán:**

```tsx
// frontend/src/App.tsx:2
import type { ReactNode } from 'react'
```

```tsx
// frontend/src/components/ui.tsx:1-9
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Tone } from '@/types'
```

**`Record<Enum, T>` thay cho `switch`** — bảng tra cứu buộc phải khai báo đủ mọi nhánh enum, thiếu một cái là lỗi compile:

```ts
// frontend/src/components/ui.tsx:73-79
const TONE_CLASS: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose:  'bg-rose-50 text-rose-700 ring-rose-200',
  sky:   'bg-sky-50 text-sky-700 ring-sky-200',
}
```

Pattern này lặp lại dày đặc: `TOAST_CLASS` (`ui.tsx:141`), `TONE` (`confirm.tsx:29`), `BANNER_STYLE` / `BANNER_ICON` / `ACTION_ROUTE` (`Dashboard.tsx:17/24/31`), `INVOICE_TONE` / `INVOICE_STATUS_LABEL` (`Invoices.tsx:182`).

**Generic component/hook:**

```ts
// frontend/src/lib/useApi.ts:15
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseApiResult<T>
```

**Union type làm khoá field** — an toàn hơn `string`:

```ts
// frontend/src/components/PaymentModal.tsx:24
type PaymentField = 'amount' | 'paid_at' | 'ref_no'
```

```ts
// frontend/src/pages/InvoiceDetail.tsx:71
function patchLine(lineId: number, key: 'quantity' | 'unit_price', value: string)
```

**`as const` cho tuple bất biến:**

```ts
// frontend/src/pages/MoveIn.tsx:30
const STEPS = ['Người thuê', 'Người ở ghép', 'Điều khoản', 'Chốt số đồng hồ'] as const
```

**Type predicate** để lọc `null` mà vẫn giữ kiểu:

```ts
// frontend/src/pages/InvoiceDetail.tsx:121
.filter((v): v is string => v !== null)
```

**`Omit` + override** để tái dùng kiểu domain cho form:

```ts
// frontend/src/pages/MoveIn.tsx:33-36
interface ServiceRow extends Omit<ServiceDefault, 'unit_price'> {
  unit_price: string
}
```

**Xử lý `unknown` trong catch** — pattern lặp lại ở mọi handler:

```ts
// frontend/src/pages/Invoices.tsx:71
toast.error(err instanceof Error ? err.message : String(err))
```

```ts
// frontend/src/lib/useApi.ts:32-34
.catch((err: unknown) => {
  if (alive) setError(err instanceof Error ? err : new Error(String(err)))
})
```

---

## 27. Những gì dự án **cố ý không dùng**

Quyết định *không* dùng cũng là kiến thức React. Các lựa chọn dưới đây đều có lý do gắn với bối cảnh (app quản lý nhà trọ, một người dùng, dữ liệu nhỏ):

| Không dùng | Lý do trong dự án |
|---|---|
| **TanStack Query / SWR** | Ghi thẳng trong code: *"không dùng thư viện query vì app chỉ có 1 người dùng, không cần cache chia sẻ hay revalidate nền"* (`useApi.ts:12-13`). `useApi` 46 dòng là đủ. |
| **Redux / Zustand** | Không có state toàn cục thật sự. State server → `useApi`; state filter → URL; state UI → `useState` cục bộ; dịch vụ UI → Context. |
| **React Hook Form / Formik** | Form validate bằng module thuần `lib/validate.ts` (`check` / `compact` / `hasErrors`), gọi tại `PaymentModal.tsx:53-61`, `MoveIn.tsx:152-198`, `InvoiceDetail.tsx:89-106`. Ít phụ thuộc, dễ tái dùng cho validate theo từng bước wizard. |
| **`React.memo`** | Không xuất hiện lần nào. Cây component nông, dữ liệu vài chục dòng — profiling chưa cho thấy nhu cầu. Đúng nguyên tắc "đo trước, tối ưu sau". |
| **`lazy` + `Suspense` / code-splitting** | 11 page nhỏ, build một bundle vẫn nhẹ. Sẽ cân nhắc khi bundle lớn lên. |
| **Portal (`createPortal`)** | Modal/toast dùng `fixed` + `z-index` (`ui.tsx:104`, `ui.tsx:168`) là đủ vì Layout không có `overflow: hidden` hay stacking context cản trở. |
| **Error Boundary** | Lỗi được bắt tại biên fetch (`useApi`) và tại từng handler (`try/catch` + toast). Chưa có boundary cho lỗi render — đây là **khoảng trống có thể bổ sung**. |
| **Uncontrolled input / `ref` vào DOM** | Mọi input controlled (mục 8); `useRef` chỉ dùng cho giá trị non-UI (mục 15). |
| **Class component, HOC, render props (thuần)** | Hook thay thế toàn bộ. Riêng render-prop vẫn xuất hiện qua API của router: `className={({ isActive }) => …}` (`App.tsx:48`). |
| **React 19 `useActionState` / `useOptimistic` / `use`** | Chưa dùng dù đã ở React 19. Form wizard cần validate theo bước và confirm giữa chừng — luồng `useState` thủ công hiện tại kiểm soát tốt hơn. |

---

## Tóm tắt bản đồ kiến thức

```
main.tsx          → createRoot, StrictMode
App.tsx           → composition (Layout/children), routing, provider nesting, NavLink render-prop
lib/useApi.ts     → custom hook, generic, useEffect + cleanup (race), useCallback + functional updater
components/ui.tsx → props & defaults, early-return null, Context API (API-as-value),
                    provider pattern, useMemo cho context value, Record<Enum, T>
components/
  confirm.tsx     → useRef giữ resolve, promise-based imperative UI, Required<Omit<>>
  PaymentModal.tsx→ controlled form, props→state sync qua useEffect, hooks-before-guard,
                    structural typing (PayableInvoice)
pages/
  Dashboard.tsx   → lazy initial state, derived grouping, lookup table cho route
  Readings.tsx    → useMemo tính nặng, EMPTY_ROWS referential stability, lifting state up,
                    state dạng Record, derived aggregates
  Invoices.tsx    → URL là state (useSearchParams), derived filters, async handler + busy
  InvoiceDetail.tsx→ draft/edit state, immutable map update, derived dirty check
  MoveIn.tsx      → wizard nhiều bước, patch() partial update, immutable nested update,
                    validate theo bước, wrapper component
```

---

*Tài liệu sinh từ mã nguồn tại nhánh `main`. Số dòng trích dẫn có thể lệch sau khi code thay đổi.*
