import { useCallback, useEffect, useState } from 'react'

/**
 * Fetch tối giản: không dùng thư viện query vì app chỉ có 1 người dùng,
 * không cần cache chia sẻ hay revalidate nền.
 */
export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    fetcher()
      .then((result) => alive && setData(result))
      .catch((err) => alive && setError(err))
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, error, loading, reload, setData }
}
