# `useApi` — edge case buộc hook phải thay đổi

> Rà soát [`frontend/src/lib/useApi.ts`](../frontend/src/lib/useApi.ts) (46 dòng) đối chiếu với 14 call site thực tế.
> Mục đích: biết trước hook sẽ gãy ở đâu, và ranh giới nào thì nên đổi cách tiếp cận thay vì vá tiếp.
>
> Bổ trợ cho [05-reactjs-in-practice.md](./05-reactjs-in-practice.md) mục 14 & 16 (giải thích cơ chế).

---

## Tóm tắt

| # | Vấn đề | Loại | Trạng thái |
|---|---|---|---|
| **A** | Cờ `alive` không bảo vệ side-effect trong `fetcher` | 🔴 Bug | ✅ **Đã sửa** — `fetcher` nhận `isAlive()` |
| **B** | `deps` khai thủ công, lint bị tắt | 🟠 Footgun | ✅ **Đã sửa** — bỏ `eslint-disable`, dùng ref + `depsKey` |
| **C** | Không cover Create/Update/Delete | 🟡 Thiếu | ✅ **Đã tạo** [`useMutation`](../frontend/src/lib/useMutation.ts) + migrate toàn bộ 15 call site |
| **D** | Không có `enabled` — fetch có điều kiện | 🟡 Thiếu | ✅ **Đã sửa** — thêm `options.enabled` |
| **E** | `loading` không tách "lần đầu" và "tải lại" | 🟡 UX | ⏸️ **Giữ nguyên** (quyết định) |
| **F** | `setData` không nhận updater | 🟡 Thiếu | ✅ **Đã sửa** — nới kiểu sang `Dispatch<SetStateAction<T \| null>>` |
| **G** | `deps` phải cố định độ dài | ⚪ Ràng buộc ngầm | ✅ Hết ràng buộc (hệ quả của B) |
| **H** | Không huỷ request thật, không cache, không retry | ⚪ Giới hạn thiết kế | ⏸️ Giữ nguyên (quyết định) |

> Phần mô tả bên dưới giữ nguyên để đối chiếu *vì sao* phải sửa. Code hiện tại đã áp dụng cách sửa được nêu.

---

# 🔴 A. Cờ `alive` không bảo vệ side-effect trong `fetcher`

**Mức độ:** bug thật, đang ảnh hưởng hai màn hình nhập liệu nặng nhất.

## Cơ chế

```ts
// useApi.ts:28-31
fetcher()                                             // ① .then của caller chạy Ở TRONG đây
  .then((result) => { if (alive) setData(result) })    // ② mới tới guard
```

`.then` mà caller viết nằm **bên trong** lời gọi `fetcher()`, nên nó resolve **trước** và **không đi qua** `if (alive)`. Cờ `alive` chỉ chặn được đúng ba lệnh của chính hook: `setData`, `setError`, `setLoading`.

## Nơi phát bệnh

```tsx
// Readings.tsx:46-58 — fetcher có side-effect
() => api.readingSheet(viewPeriod).then((res) => {
       setReadDate(res.default_read_date)   // ← chạy vô điều kiện
       setValues(initial)                   // ← không qua alive
       setChanged({})
       return res
     })
```

Rà soát cả codebase thấy **4 fetcher có side-effect**, không phải 2:

| File | Side-effect | Deps | Rủi ro |
|---|---|---|---|
| `Readings.tsx` | `setReadDate` · `setValues` · `setChanged` | `[viewPeriod]` | **Cao** — đổi kỳ liên tục |
| `MoveOut.tsx` | `setReadings` | `[id, endDate]` | **Cao** — đổi ngày trả phòng liên tục |
| `MoveIn.tsx` | `setForm` | `[roomId]` | Thấp — roomId cố định theo route |
| `Settings.tsx` | `setValues` | `[]` | Thấp — chỉ race khi bấm reload |

## Kịch bản hỏng

Người dùng bấm nhanh kỳ `07` → `08` → `09`. Ba request bay đi, response `07` về sau cùng:

| Trạng thái | Kết quả |
|---|---|
| `data` (dữ liệu bảng) | ✅ đúng kỳ **09** — `alive` chặn được |
| `values` (12 ô nhập) | ❌ bị ghi đè bằng số kỳ **07** |
| `readDate` | ❌ ngày ghi của kỳ **07** |

Người dùng thấy tiêu đề "Kỳ 09" nhưng các ô nhập là số kỳ 07 — và nếu bấm Lưu thì ghi sai chỉ số vào DB.

Xác suất thấp (mạng nội bộ, ít người dùng) nhưng hậu quả là **sai dữ liệu tiền bạc**, không phải sai hiển thị.

## Cách sửa — truyền `isAlive` xuống `fetcher`

```ts
// useApi.ts
export interface UseApiResult<T> { … }

export function useApi<T>(
  fetcher: (isAlive: () => boolean) => Promise<T>,   // ← đổi chữ ký
  deps: unknown[] = [],
): UseApiResult<T> {
  …
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    fetcher(() => alive)                              // ← truyền xuống
      .then((result) => { if (alive) setData(result) })
      …
  }, [...deps, tick])
}
```

Call site sửa tối thiểu — chỉ hai file có side-effect cần đụng:

```tsx
// Readings.tsx
const { data, error, loading, reload } = useApi(
  (isAlive) =>
    api.readingSheet(viewPeriod).then((res) => {
      if (!isAlive()) return res      // ← thoát trước khi đụng state
      setReadDate(res.default_read_date)
      setValues(initial)
      setChanged({})
      return res
    }),
  [viewPeriod],
)
```

12 call site còn lại không dùng tham số nên giữ nguyên — TypeScript cho phép bỏ qua tham số không dùng.

**Phương án thay thế đã cân nhắc và loại:** bỏ hẳn side-effect khỏi `fetcher`, chuyển sang một `useEffect` riêng nghe `data`. Loại vì phải thêm một vòng render và một effect nữa cho mỗi màn hình, trong khi vấn đề gốc (guard không phủ hết) vẫn còn nếu ai đó lặp lại pattern này.

---

# 🟠 B. `deps` khai thủ công, lint bị tắt

```ts
// useApi.ts:42-43
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [...deps, tick])
```

Dòng `eslint-disable` này tắt đúng cái rule bắt được lỗi quên dependency.

`fetcher` là closure bắt **mọi** biến trong scope, nhưng `deps` do người viết tự khai. Quên một biến ⇒ dữ liệu cũ **vĩnh viễn, im lặng, không cảnh báo**:

```tsx
const [keyword, setKeyword] = useState('')

useApi(() => api.invoices({ q: keyword }), [])   // ⚠️ gõ keyword không bao giờ refetch
//                                        ^^ thiếu keyword
```

## Vì sao vẫn chấp nhận

Không tắt được lint mà vẫn giữ API hiện tại: `fetcher` là arrow function mới ở mỗi render, đưa vào deps sẽ fetch vô hạn. Hợp đồng của hook là *"caller tự khai deps"* — giống hệt cách `useSWR`/`useQuery` yêu cầu khai `key`.

## Giảm rủi ro

- Code review chú ý riêng dòng `useApi(...)`: mọi biến xuất hiện trong `fetcher` phải có mặt trong `deps`.
- 14 call site hiện tại **đã khai đúng** — kiểm tra lại khi thêm mới.
- Nếu muốn ép bằng máy: đổi sang truyền `key` dạng mảng giá trị + `fetcher` nhận key làm tham số (mô hình TanStack Query). Đây là thay đổi lớn, chỉ đáng làm khi số call site tăng nhiều.

---

# 🟡 C. Không cover Create / Update / Delete

`useApi` chỉ làm chữ **R**. 15 chỗ gọi mutation trong `pages/` đều gọi thẳng `api.*` trong handler.

## Pattern đang lặp

```tsx
// Invoices.tsx:65-75 — nguyên xi ở 9 chỗ / 7 file
setBusy(true)
try {
  const result = await api.issueAll(periodFilter)
  toast.success(`Đã phát hành ${result.issued} hoá đơn.`)
  reload()
} catch (err) {
  toast.error(err instanceof Error ? err.message : String(err))
} finally {
  setBusy(false)
}
```

Đã có một bản trừu tượng hoá **kẹt trong một file duy nhất**:

```tsx
// InvoiceDetail.tsx:75-86
async function act(fn: () => Promise<unknown>, successMessage: string) {
  setBusy(true)
  try {
    await fn()
    toast.success(successMessage)
    reload()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    setBusy(false)
  }
}
```

## Read và Write là hai vòng đời khác nhau

| | Read (`useApi`) | Write (chưa có) |
|---|---|---|
| Kích hoạt | render + `deps` đổi | hành động người dùng |
| Số lần chạy | tự động, nhiều lần | đúng một lần mỗi lần bấm |
| Cờ trạng thái | `loading` | `busy` (khai thủ công mỗi page) |
| Báo lỗi | `<ErrorBox>` chiếm cả trang | `toast.error` |
| Sau khi xong | — | `toast.success` + `reload()` |

## Hướng xử lý

Tách **hook riêng**, không nhồi vào `useApi` — ép chung sẽ tạo ra một `loading` lúc nghĩa này lúc nghĩa kia:

```ts
// lib/useMutation.ts (đề xuất)
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: { onSuccess?: (result: TResult) => void; successMessage?: string },
) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const run = useCallback(async (...args: TArgs) => {
    setBusy(true)
    try {
      const result = await fn(...args)
      if (options?.successMessage) toast.success(options.successMessage)
      options?.onSuccess?.(result)
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [fn])

  return { run, busy }
}
```

Xoá được 9 khối lặp. **Lưu ý khi làm:** nhiều mutation cần message động dựng từ kết quả (`Đã phát hành ${result.issued} hoá đơn`, `Readings.tsx:165`) hoặc gộp nhiều dòng (`InvoiceDetail.tsx:147-156`) — API phải cho phép `successMessage` là hàm nhận `result`, nếu không sẽ có page không dùng được.

---

# 🟡 D. Không có `enabled` — không hoãn được fetch

Hook fetch ngay khi mount, không có cách khai "chưa đủ điều kiện thì đừng gọi".

Hệ quả thấy được: phải ép kiểu `!` để qua mặt TypeScript ở 4 chỗ:

```tsx
// InvoiceDetail.tsx:48
const { data, error, loading, reload } = useApi(() => api.invoice(id!), [id])
//                                                              ^^^ id có thể undefined
```

```tsx
// MoveIn.tsx:80
api.moveInDefaults(roomId!)
```

Route hiện luôn có param nên chưa hỏng, nhưng `id!` là lời hứa suông — URL sai sẽ gọi API với `undefined` trong path.

Chưa kể các nhu cầu tương lai không làm được: *"chưa chọn phòng thì đừng tải hoá đơn"*, *"query B chờ kết quả query A"*.

## Cách sửa (nhỏ)

```ts
export function useApi<T>(
  fetcher: (isAlive: () => boolean) => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {},
): UseApiResult<T> {
  const enabled = options.enabled ?? true
  …
  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let alive = true
    …
  }, [...deps, tick, enabled])
}
```

```tsx
const { data } = useApi(() => api.invoice(id!), [id], { enabled: !!id })
```

Giải quyết luôn cả bài toán query phụ thuộc: `{ enabled: !!parentQuery.data }`.

---

# 🟡 E. `loading` không tách "lần đầu" và "tải lại"

`reload()` set `loading = true`, mà mọi page đều:

```tsx
if (loading) return <Spinner />
```

⇒ **cả trang chớp trắng** rồi vẽ lại. Sau khi lưu 12 ô chỉ số ở Readings, bảng biến mất một nhịp dù dữ liệu cũ vẫn còn nguyên trong `data`.

## Cách sửa (không đụng call site nào)

Thêm hai cờ dẫn xuất vào giá trị trả về:

```ts
return {
  data, error, loading, reload, setData,
  isFirstLoad: loading && data === null,     // chưa từng có dữ liệu
  isRefreshing: loading && data !== null,    // đang làm mới, vẫn còn dữ liệu cũ
}
```

Page nào muốn trải nghiệm mượt hơn thì đổi guard:

```tsx
if (isFirstLoad) return <Spinner />
// isRefreshing → làm mờ bảng hoặc hiện thanh mỏng, không tháo dữ liệu
```

Page chưa đổi vẫn chạy nguyên như cũ vì `loading` giữ nguyên ý nghĩa.

---

# 🟡 F. `setData` không nhận updater — chặn đường phân trang

```ts
// useApi.ts:8
setData: (value: T | null) => void
```

Chữ ký chỉ nhận **giá trị**, không nhận **hàm cập nhật**. Hai hệ quả:

1. **Không nối được dữ liệu** — "tải thêm" cần `setData(prev => [...prev, ...next])`. Hiện tại effect luôn **thay** `data`, nên trang 2 sẽ xoá trang 1.
2. **Optimistic update phải đọc `data` từ closure** — dễ dính stale value nếu có nhiều thao tác liên tiếp.

## Cách sửa

```ts
setData: (value: T | null | ((prev: T | null) => T | null)) => void
```

Setter của `useState` vốn đã hỗ trợ dạng này — chỉ cần nới kiểu trong `UseApiResult`, không đổi phần thân.

> Ghi chú: `setData` hiện **chưa call site nào dùng** (0/14). Nó là công năng đã export nhưng chưa khai thác — xem [05-reactjs-in-practice.md](./05-reactjs-in-practice.md) mục C1.

---

# ⚪ G. `deps` phải cố định độ dài

```ts
// useApi.ts:43
}, [...deps, tick])
```

React yêu cầu mảng deps giữ **nguyên kích thước** giữa các lần render. Truyền mảng dài ngắn thất thường sẽ khiến React báo lỗi:

```tsx
useApi(fetcher, showAll ? [a, b] : [a])   // ⚠️ độ dài đổi theo state
```

14 call site hiện tại đều cố định nên an toàn, nhưng **không có gì trong kiểu dữ liệu ép được điều này** — `unknown[]` không mã hoá được độ dài.

Nếu buộc phải hỗ trợ: gói cả mảng thành một dep duy nhất bằng `JSON.stringify(deps)`. Đánh đổi: so sánh sâu (chậm hơn) và hỏng với giá trị không serialize được (`Date`, `Map`, hàm).

---

# ⚪ H. Giới hạn thiết kế — cố ý không làm

Comment đầu file đã vạch sẵn ranh giới:

```ts
// useApi.ts:11-14
/**
 * Fetch tối giản: không dùng thư viện query vì app chỉ có 1 người dùng,
 * không cần cache chia sẻ hay revalidate nền.
 */
```

| Giới hạn | Chi tiết |
|---|---|
| **Không huỷ request thật** | `alive` chỉ **bỏ qua kết quả**; request vẫn chạy tới cùng, vẫn tốn băng thông. Muốn huỷ thật cần `AbortController` + truyền signal xuống axios |
| **Không cache** | Rời trang rồi quay lại = fetch lại từ đầu, không có dữ liệu tạm để hiển thị ngay |
| **Không dedupe** | Hai component cùng gọi `api.rooms()` = 2 request ([Contracts.tsx:10](../frontend/src/pages/Contracts.tsx#L10), [Expenses.tsx:16](../frontend/src/pages/Expenses.tsx#L16)) |
| **Không retry / backoff** | Lỗi mạng thoáng qua ⇒ người dùng tự bấm "Thử lại" |
| **Không revalidate on focus** | Mở tab 2 tiếng, số liệu vẫn cũ tới khi bấm reload |
| **StrictMode fetch 2 lần ở dev** | Vô hại (đã có cleanup), chỉ tốn request lúc phát triển |

Các giới hạn này **không phải thiếu sót** — chúng là hệ quả trực tiếp của giả định "app một người dùng". Vá từng cái sẽ dần dựng lại một thư viện query kém hơn bản có sẵn.

---

# Ranh giới quyết định

## Đã sửa trong `useApi` (A · B · D · F · G)

Hook đi từ 46 → 84 dòng, vẫn đọc hết trong một màn hình, vẫn giữ tinh thần "tối giản" ban đầu.

## Đã tách hook mới (C)

[`lib/useMutation.ts`](../frontend/src/lib/useMutation.ts) — gói `busy` / `try` / `catch` / `toast` cho các lời gọi ghi. Toàn bộ 15 call site ở 8 file đã chuyển sang; không còn `setBusy` / `setSaving` / `catch (err)` nào trong `pages/`.

Ba chỗ cần xử lý riêng khi migrate:

| Chỗ | Vấn đề | Cách giải |
|---|---|---|
| [Invoices.tsx](../frontend/src/pages/Invoices.tsx) | Một `busy` dùng chung cho `issueAll` + `issueOne` | `const busy = issueAllMut.busy \|\| issueOneMut.busy` — giữ nguyên hành vi khoá chéo |
| [Billing.tsx](../frontend/src/pages/Billing.tsx) | `busyKey` giàu hơn boolean (`'all' \| 'exp' \| contract_id`) | Giữ thêm `pendingContractId`, dựng lại `busyKey` từ 3 cờ `busy` |
| [InvoiceDetail.tsx](../frontend/src/pages/InvoiceDetail.tsx) | `act(fn, msg)` nhận `fn` khác nhau mỗi lần gọi | Một mutation nhận `{ fn, message }` làm tham số — 4 call site của `act()` không phải đổi |

Hai chỗ dùng `onSuccess` thay cho `success` vì thông báo không phải một chuỗi đơn: [InvoiceDetail `saveEditsMut`](../frontend/src/pages/InvoiceDetail.tsx) (gộp nhiều dòng) và [Expenses `createMut`](../frontend/src/pages/Expenses.tsx) (parent lo toast qua `onSaved`).

## Giữ nguyên có chủ đích (E · H)

- **E** — mọi page vẫn `if (loading) return <Spinner />`. Chấp nhận chớp trắng khi reload.
- **H** — không cache, không dedupe, không retry, không huỷ request thật.

## Nên đổi sang TanStack Query

Khi **giả định gốc bị phá vỡ**, tức là khi xuất hiện một trong các dấu hiệu sau:

- Nhiều người dùng đồng thời, dữ liệu đổi sau lưng
- Cần cache chia sẻ giữa các page (rời trang rồi quay lại phải hiển thị ngay)
- Cần revalidate nền / on-focus
- Cần optimistic update có rollback tự động
- Cần infinite scroll thật sự

Tới lúc đó, tự viết sẽ tốn hơn học thư viện — và mỗi tính năng vá thêm vào `useApi` sẽ là công sức phải vứt đi.

---

*Rà soát trên nhánh `main`. Số dòng trích dẫn có thể lệch sau khi code thay đổi.*
