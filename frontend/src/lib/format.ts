import type { IsoDate, PeriodYm } from '@/types'

const vnd = new Intl.NumberFormat('vi-VN')

/** Giá trị số có thể đến từ ô input (chuỗi) hoặc từ API (số). */
type Numeric = number | string | null | undefined

/** 2000000 → "2.000.000" */
export function money(value: Numeric): string {
  if (value === null || value === undefined || value === '') return '—'
  return vnd.format(Math.round(Number(value)))
}

/** 2000000 → "2.000.000đ" */
export function moneyd(value: Numeric): string {
  if (value === null || value === undefined || value === '') return '—'
  return `${vnd.format(Math.round(Number(value)))}đ`
}

/** Rút gọn cho thẻ tổng quan: 8400000 → "8,4tr" */
export function moneyShort(value: Numeric): string {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}tr`
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

/** Bỏ .00 thừa: 148 → "148", 3.2 → "3,2" */
export function num(value: Numeric): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isInteger(n) ? vnd.format(n) : vnd.format(n).replace(/,?0+$/, '')
}

/** "2026-08-31" → "31/08/2026" */
export function date(value: IsoDate | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

/** "2026-08-31" → "31/08" */
export function dateShort(value: IsoDate | null | undefined): string {
  if (!value) return '—'
  const [, m, d] = value.split('-')
  return `${d}/${m}`
}

/** "202608" → "08/2026" */
export function period(ym: PeriodYm | null | undefined): string {
  if (!ym) return '—'
  return `${ym.slice(4, 6)}/${ym.slice(0, 4)}`
}

/** "202608" → "202607" */
export function prevPeriod(ym: PeriodYm): PeriodYm {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(4, 6))
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "202608" → "202609" */
export function nextPeriod(ym: PeriodYm): PeriodYm {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(4, 6))
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function todayISO(): IsoDate {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Kỳ của tháng hiện tại, dạng 'YYYYMM'. */
export function currentPeriod(): PeriodYm {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** '2026-08' (giá trị input type=month) → '202608' */
export function monthInputToPeriod(value: string): PeriodYm {
  return value.replace('-', '')
}

/** '202608' → '2026-08' cho input type=month */
export function periodToMonthInput(ym: PeriodYm): string {
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`
}
