const vnd = new Intl.NumberFormat('vi-VN')

/** 2000000 -> "2.000.000" */
export function money(value) {
  if (value === null || value === undefined || value === '') return '—'
  return vnd.format(Math.round(value))
}

/** 2000000 -> "2.000.000đ" */
export function moneyd(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `${vnd.format(Math.round(value))}đ`
}

/** Rút gọn cho thẻ tổng quan: 8400000 -> "8,4tr" */
export function moneyShort(value) {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}tr`
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

/** Bỏ .00 thừa: 148.00 -> "148", 3.20 -> "3,2" */
export function num(value) {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isInteger(n) ? vnd.format(n) : vnd.format(n).replace(/,?0+$/, '')
}

/** "2026-08-31" -> "31/08/2026" */
export function date(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

/** "2026-08-31" -> "31/08" */
export function dateShort(value) {
  if (!value) return '—'
  const [, m, d] = value.split('-')
  return `${d}/${m}`
}

/** "202608" -> "08/2026" */
export function period(ym) {
  if (!ym) return '—'
  return `${ym.slice(4, 6)}/${ym.slice(0, 4)}`
}

/** "202608" -> "202607" */
export function prevPeriod(ym) {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(4, 6))
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nextPeriod(ym) {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(4, 6))
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
