import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Modal } from './ui'

/**
 * Hộp thoại xác nhận dạng promise: `await confirm({...})` trả về true/false.
 *
 * Dùng cho thao tác khó lùi (xoá, huỷ, phát hành, tất toán) — không dùng cho
 * mọi nút bấm, vì hỏi quá nhiều thì người dùng bấm Đồng ý theo phản xạ
 * và cảnh báo mất tác dụng.
 */
const ConfirmCtx = createContext(async () => true)

const TONE = {
  danger: { btn: 'btn-danger', icon: '⚠' },
  primary: { btn: 'btn-primary', icon: '?' },
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((options) => {
    setState({
      title: options.title ?? 'Xác nhận',
      message: options.message ?? '',
      details: options.details ?? null,
      confirmLabel: options.confirmLabel ?? 'Đồng ý',
      cancelLabel: options.cancelLabel ?? 'Huỷ',
      tone: options.tone ?? 'primary',
    })

    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function close(result) {
    resolver.current?.(result)
    resolver.current = null
    setState(null)
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
        {state && (
          <div className="space-y-4">
            <p className="whitespace-pre-line text-sm text-slate-700">
              <span className="mr-1">{TONE[state.tone].icon}</span>
              {state.message}
            </p>

            {state.details && (
              <ul className="list-inside list-disc space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                {state.details.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => close(false)}>
                {state.cancelLabel}
              </button>
              <button className={TONE[state.tone].btn} onClick={() => close(true)} autoFocus>
                {state.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmCtx)
}
