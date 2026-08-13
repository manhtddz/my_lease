import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Modal } from './ui'

/**
 * Hộp thoại xác nhận dạng promise: `await confirm({...})` trả về true/false.
 *
 * Dùng cho thao tác khó lùi (xoá, huỷ, phát hành, tất toán) — không dùng cho
 * mọi nút bấm, vì hỏi quá nhiều thì người dùng bấm Đồng ý theo phản xạ
 * và cảnh báo mất tác dụng.
 */

export type ConfirmTone = 'danger' | 'primary'

export interface ConfirmOptions {
  title?: string
  message?: string
  /** Danh sách hệ quả — hiện dạng bullet trong khung xám. */
  details?: string[] | null
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

/** Mặc định đồng ý — chỉ xảy ra khi component nằm ngoài provider. */
const ConfirmCtx = createContext<ConfirmFn>(async () => true)

const TONE: Record<ConfirmTone, { btn: string; icon: string }> = {
  danger: { btn: 'btn-danger', icon: '⚠' },
  primary: { btn: 'btn-primary', icon: '?' },
}

interface ConfirmState extends Required<Omit<ConfirmOptions, 'details'>> {
  details: string[] | null
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

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

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx)
}
