import { msg, type FieldKey, type FieldOrLabel } from './messages'

/**
 * Validate phía client — chặn lỗi rõ ràng trước khi gọi API.
 *
 * KHÔNG thay thế validate ở backend: đây chỉ là lớp phản hồi nhanh cho người dùng.
 * Luật thật vẫn nằm ở Laravel.
 *
 * Mỗi rule nhận (value, field) và trả về thông điệp hoặc null. Thông điệp lấy từ
 * lib/messages.ts — rule chỉ chọn khoá, không tự viết câu, để đổi cách diễn đạt
 * thì sửa một chỗ duy nhất.
 *
 *   check('amount', value, [required, positive])
 *   check('deduction', value, [required, notNegative, max(held, '2.000.000đ')])
 */

/** Giá trị cần kiểm — ô input luôn trả chuỗi, kể cả ô số. */
export type Validatable = string | number | null | undefined

/** Một luật: trả thông điệp lỗi, hoặc null khi hợp lệ. */
export type Rule = (value: Validatable, field: FieldOrLabel) => string | null

/** Tập lỗi theo field, dùng làm state của form. */
export type Errors<K extends string = string> = Partial<Record<K, string>>

// --- Rule không tham số ---

export const required: Rule = (value, field) =>
  value === null || value === undefined || String(value).trim() === '' ? msg('required', field) : null

export const isNumber: Rule = (value, field) =>
  value === '' || value === null || value === undefined || Number.isNaN(Number(value))
    ? msg('number', field)
    : null

export const positive: Rule = (value, field) =>
  isNumber(value, field) ?? (Number(value) <= 0 ? msg('positive', field) : null)

export const notNegative: Rule = (value, field) =>
  isNumber(value, field) ?? (Number(value) < 0 ? msg('notNegative', field) : null)

export const phone: Rule = (value, field) =>
  value && !/^0\d{8,10}$/.test(String(value).replace(/\s/g, '')) ? msg('phone', field) : null

export const idCard: Rule = (value, field) =>
  value && !/^\d{9}$|^\d{12}$/.test(String(value).replace(/\s/g, '')) ? msg('idCard', field) : null

export const dateNotFuture: Rule = (value, field) =>
  value && String(value) > new Date().toISOString().slice(0, 10) ? msg('dateFuture', field) : null

// --- Rule có tham số: gọi để lấy ra rule ---

/** max(2000000, '2.000.000đ') — tham số thứ hai là cách hiển thị cho người dùng. */
export const max =
  (limit: number, display: string | number | null = null): Rule =>
  (value, field) =>
    Number(value) > limit ? msg('max', field, { max: display ?? limit }) : null

export const min =
  (limit: number, display: string | number | null = null): Rule =>
  (value, field) =>
    Number(value) < limit ? msg('min', field, { min: display ?? limit }) : null

/** Chỉ số mới không được nhỏ hơn chỉ số cũ. */
export const notLessThan =
  (prev: number, display: string | number | null = null): Rule =>
  (value, field) =>
    Number(value) < prev ? msg('lessThanPrev', field, { prev: display ?? prev }) : null

export const dateAfter =
  (other: string | null | undefined, display: string): Rule =>
  (value, field) =>
    value && other && String(value) < other ? msg('dateAfter', field, { other: display }) : null

// --- Tổ hợp ---

/**
 * Gom nhiều luật cho một field, lấy lỗi đầu tiên.
 *
 * `field` phải là khoá đã khai trong FIELD — gõ sai tên là lỗi compile, không
 * phải nhãn lạ hiện lên UI. Cần nhãn khác từ điển thì truyền `labelOverride`,
 * đó là đường duy nhất để đưa chuỗi tự do vào.
 */
export function check(
  field: FieldKey,
  value: Validatable,
  rules: Rule[],
  labelOverride: string | null = null,
): string | null {
  for (const rule of rules) {
    const error = rule(value, labelOverride ?? field)
    if (error) return error
  }
  return null
}

/** Bỏ các key rỗng để dễ kiểm tra `Object.keys(errors).length`. */
export function compact<K extends string>(errors: Partial<Record<K, string | null>>): Errors<K> {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as Errors<K>
}

/** Form có lỗi nào không. */
export function hasErrors(errors: Errors): boolean {
  return Object.keys(errors).length > 0
}
