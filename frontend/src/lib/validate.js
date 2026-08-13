import { msg } from './messages'

/**
 * Validate phía client — chặn lỗi rõ ràng trước khi gọi API.
 *
 * KHÔNG thay thế validate ở backend: đây chỉ là lớp phản hồi nhanh cho người dùng.
 * Luật thật vẫn nằm ở Laravel.
 *
 * Mỗi rule nhận (value, field) và trả về thông điệp hoặc null. Thông điệp lấy từ
 * lib/messages.js — rule chỉ chọn khoá, không tự viết câu, để đổi cách diễn đạt
 * thì sửa một chỗ duy nhất.
 *
 *   check('amount', value, [required, positive])
 *   check('deduction', value, [required, notNegative, max(held, '2.000.000đ')])
 */

export const required = (value, field) =>
  value === null || value === undefined || String(value).trim() === '' ? msg('required', field) : null

export const isNumber = (value, field) =>
  value === '' || value === null || Number.isNaN(Number(value)) ? msg('number', field) : null

export const positive = (value, field) =>
  isNumber(value, field) ?? (Number(value) <= 0 ? msg('positive', field) : null)

export const notNegative = (value, field) =>
  isNumber(value, field) ?? (Number(value) < 0 ? msg('notNegative', field) : null)

export const phone = (value, field = 'phone') =>
  value && !/^0\d{8,10}$/.test(String(value).replace(/\s/g, '')) ? msg('phone', field) : null

export const idCard = (value, field = 'id_card_no') =>
  value && !/^\d{9}$|^\d{12}$/.test(String(value).replace(/\s/g, '')) ? msg('idCard', field) : null

export const dateNotFuture = (value, field) =>
  value && value > new Date().toISOString().slice(0, 10) ? msg('dateFuture', field) : null

// --- Rule có tham số: gọi để lấy ra rule ---

/** max(2000000, '2.000.000đ') — tham số thứ hai là cách hiển thị cho người dùng. */
export const max = (limit, display = null) => (value, field) =>
  Number(value) > limit ? msg('max', field, { max: display ?? limit }) : null

export const min = (limit, display = null) => (value, field) =>
  Number(value) < limit ? msg('min', field, { min: display ?? limit }) : null

/** Chỉ số mới không được nhỏ hơn chỉ số cũ. */
export const notLessThan = (prev, display = null) => (value, field) =>
  Number(value) < prev ? msg('lessThanPrev', field, { prev: display ?? prev }) : null

export const dateAfter = (other, display) => (value, field) =>
  value && other && value < other ? msg('dateAfter', field, { other: display }) : null

// --- Tổ hợp ---

/**
 * Gom nhiều luật cho một field, lấy lỗi đầu tiên.
 * Truyền `labelOverride` khi cần nhãn khác từ điển.
 */
export function check(field, value, rules, labelOverride = null) {
  for (const rule of rules) {
    const error = rule(value, labelOverride ?? field)
    if (error) return error
  }
  return null
}

/** Bỏ các key rỗng để dễ kiểm tra `Object.keys(errors).length`. */
export function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v))
}
