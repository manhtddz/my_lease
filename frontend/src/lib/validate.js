/**
 * Validate phía client — chặn lỗi rõ ràng trước khi gọi API.
 *
 * KHÔNG thay thế validate ở backend: đây chỉ là lớp phản hồi nhanh cho người dùng.
 * Luật thật vẫn nằm ở Laravel Form Request và ở service.
 */

export const required = (value, label) =>
  value === null || value === undefined || String(value).trim() === '' ? `${label} không được để trống` : null

export const isNumber = (value, label) =>
  value === '' || value === null || Number.isNaN(Number(value)) ? `${label} phải là số` : null

export const positive = (value, label) => {
  const err = isNumber(value, label)
  if (err) return err
  return Number(value) <= 0 ? `${label} phải lớn hơn 0` : null
}

export const notNegative = (value, label) => {
  const err = isNumber(value, label)
  if (err) return err
  return Number(value) < 0 ? `${label} không được âm` : null
}

export const maxValue = (value, max, label, maxLabel) =>
  Number(value) > max ? `${label} không được vượt quá ${maxLabel}` : null

export const phone = (value) =>
  value && !/^0\d{8,10}$/.test(String(value).replace(/\s/g, ''))
    ? 'Số điện thoại không hợp lệ (bắt đầu bằng 0, 9–11 chữ số)'
    : null

export const idCard = (value) =>
  value && !/^\d{9}$|^\d{12}$/.test(String(value).replace(/\s/g, ''))
    ? 'CCCD phải 12 số, CMND phải 9 số'
    : null

export const dateNotFuture = (value, label) =>
  value && value > new Date().toISOString().slice(0, 10) ? `${label} không được ở tương lai` : null

/**
 * Gom nhiều luật cho một field, lấy lỗi đầu tiên.
 * check('Số tiền', amount, [required, positive])
 */
export function check(label, value, rules) {
  for (const rule of rules) {
    const error = rule(value, label)
    if (error) return error
  }
  return null
}

/** Bỏ các key có giá trị null để dễ kiểm tra `Object.keys(errors).length`. */
export function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v))
}
