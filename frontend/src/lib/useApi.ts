import { useCallback, useEffect, useState } from 'react'

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
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

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

  return { data, error, loading, reload, setData }
}
