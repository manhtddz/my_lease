import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

export interface UseApiResult<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
  /** Nhận cả giá trị lẫn hàm cập nhật — dùng cho optimistic update hoặc nối thêm dữ liệu. */
  setData: Dispatch<SetStateAction<T | null>>
}

export interface UseApiOptions {
  /** false = hoãn gọi API (thiếu tham số, hoặc chờ kết quả query khác). Mặc định true. */
  enabled?: boolean
}

/**
 * Fetch tối giản: không dùng thư viện query vì app chỉ có 1 người dùng,
 * không cần cache chia sẻ hay revalidate nền.
 *
 * `fetcher` nhận `isAlive()`. Nếu fetcher set state nằm ngoài hook thì PHẢI
 * kiểm tra `isAlive()` trước — hook chỉ tự bảo vệ được state của chính nó,
 * còn response cũ về muộn vẫn chạy `.then` của caller và ghi đè dữ liệu mới.
 *
 * `deps` so sánh theo giá trị (JSON) nên chỉ truyền dữ liệu serialize được;
 * đổi lại độ dài mảng được phép thay đổi giữa các lần render.
 */
export function useApi<T>(
  fetcher: (isAlive: () => boolean) => Promise<T>,
  deps: unknown[] = [],
  options: UseApiOptions = {},
): UseApiResult<T> {
  const { enabled = true } = options

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [tick, setTick] = useState(0)

  // Giữ fetcher ngoài deps: nó là arrow function mới ở mỗi render nên đưa vào
  // deps sẽ fetch vô hạn. Ref cho phép effect luôn chạy bản mới nhất mà không
  // cần tắt rule exhaustive-deps.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const reload = useCallback(() => setTick((t) => t + 1), [])

  const depsKey = JSON.stringify(deps)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let alive = true
    setLoading(true)
    setError(null)

    fetcherRef
      .current(() => alive)
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
  }, [depsKey, tick, enabled])

  return { data, error, loading, reload, setData }
}
