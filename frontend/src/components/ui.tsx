import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Tone } from '@/types'

// ---------------------------------------------------------------- trạng thái

export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
      {label}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <div className="font-medium">Có lỗi xảy ra</div>
      <div className="mt-1 whitespace-pre-line">{error.message}</div>
      {onRetry && (
        <button className="btn-ghost mt-3" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-sm text-slate-400">{children}</div>
}

// ------------------------------------------------------------------ form

/** Thông báo lỗi dưới ô nhập. Trả null khi không có lỗi để không chiếm chỗ. */
export function FieldError({ error }: { error?: string | null }) {
  if (!error) return null
  return <p className="mt-1 text-xs text-rose-600">{error}</p>
}

export interface FieldProps {
  label?: string
  error?: string | null
  hint?: string
  children: ReactNode
  className?: string
}

/** Nhóm nhãn + ô nhập + lỗi. Viền đỏ khi có lỗi để mắt bắt được ngay. */
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

// ------------------------------------------------------------------- nhãn mã

const TONE_CLASS: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
}

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}

// --------------------------------------------------------------------- modal

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className={`card w-full ${width} my-auto`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- toasts

type ToastTone = 'green' | 'rose' | 'sky'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

export interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const NOOP_TOAST: ToastApi = { success: () => {}, error: () => {}, info: () => {} }

const ToastCtx = createContext<ToastApi>(NOOP_TOAST)

const TOAST_CLASS: Record<ToastTone, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rose: 'border-rose-200 bg-rose-50 text-rose-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, tone: ToastTone = 'green') => {
    const id = Math.random().toString(36).slice(2)
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200)
  }, [])

  const value = useMemo<ToastApi>(
    () => ({
      success: (m) => push(m, 'green'),
      error: (m) => push(m, 'rose'),
      info: (m) => push(m, 'sky'),
    }),
    [push],
  )

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
}

export function useToast(): ToastApi {
  return useContext(ToastCtx)
}
