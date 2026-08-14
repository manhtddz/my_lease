import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui'

/** Chuỗi cố định, hoặc hàm dựng thông báo từ kết quả API trả về. */
export type SuccessMessage<TResult> = string | ((result: TResult) => string)

export interface UseMutationOptions<TResult> {
  /** Báo thành công. Bỏ trống nếu caller tự lo (ví dụ cần gộp nhiều dòng). */
  success?: SuccessMessage<TResult>
  /** Chạy sau khi báo thành công — reload, navigate, đóng modal… */
  onSuccess?: (result: TResult) => void
}

export interface UseMutationResult<TArgs extends unknown[], TResult> {
  /** Trả về kết quả khi thành công, `undefined` khi lỗi (lỗi đã được toast). */
  run: (...args: TArgs) => Promise<TResult | undefined>
  busy: boolean
}

/**
 * Đối trọng ghi của `useApi`: gói `busy` + try/catch + toast cho các lời gọi
 * thay đổi dữ liệu (create / update / delete).
 *
 * Tách riêng thay vì nhồi vào useApi vì hai vòng đời khác nhau — đọc thì tự
 * chạy theo deps, ghi thì chỉ chạy khi người dùng bấm; và `loading` che cả
 * trang trong khi `busy` chỉ khoá nút bấm.
 *
 * Việc kiểm tra dữ liệu và hỏi xác nhận nằm ở phía caller, không nằm trong hook —
 * mỗi màn hình có luật riêng và cần dừng lại trước khi bật `busy`.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: UseMutationOptions<TResult> = {},
): UseMutationResult<TArgs, TResult> {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  // Caller truyền arrow function inline nên fn/options mới ở mỗi render.
  // Giữ qua ref để `run` có một định danh duy nhất, an toàn khi đưa vào deps.
  const fnRef = useRef(fn)
  const optionsRef = useRef(options)
  useEffect(() => {
    fnRef.current = fn
    optionsRef.current = options
  })

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setBusy(true)
      try {
        const result = await fnRef.current(...args)
        const { success, onSuccess } = optionsRef.current

        if (success) {
          toast.success(typeof success === 'function' ? success(result) : success)
        }
        onSuccess?.(result)

        return result
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )

  return { run, busy }
}
