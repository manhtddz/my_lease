/**
 * Từ điển thông điệp và nhãn field.
 *
 * Nguyên tắc: MỘT thông điệp chung có chỗ trống, nhãn field thay vào — giống
 * `:attribute` của Laravel. Đổi cách diễn đạt thì sửa một chỗ, không phải đi
 * tìm 20 câu na ná nhau rải rác trong các trang.
 *
 * Đối chiếu với backend: lang/vi/validation.php giữ đúng bộ nhãn này.
 * Sửa một bên thì sửa cả bên kia, nếu không người dùng thấy hai tên cho một field.
 */

/** Nhãn hiển thị của field. Key trùng tên field gửi lên API để dễ tra. */
export const FIELD = {
  // ghi số
  reading: 'Chỉ số',
  reading_electric: 'Chỉ số điện',
  reading_water: 'Chỉ số nước',
  read_date: 'Ngày ghi số',
  period_ym: 'Kỳ',

  // người thuê
  full_name: 'Họ tên',
  phone: 'Số điện thoại',
  id_card_no: 'CCCD/CMND',
  dob: 'Ngày sinh',
  hometown: 'Thường trú',

  // hợp đồng
  start_date: 'Ngày vào',
  end_date: 'Ngày hết hạn',
  rent_amount: 'Tiền phòng',
  deposit_amount: 'Tiền cọc',
  occupant_count: 'Số người ở',
  occupant_name: 'Họ tên người ở ghép',
  unit_price: 'Đơn giá',
  quantity: 'Số lượng',

  // trả phòng
  deduction: 'Tiền trừ cọc',
  deduction_reason: 'Lý do trừ cọc',

  // hoá đơn & thu tiền
  amount: 'Số tiền',
  paid_at: 'Ngày thu',
  method: 'Hình thức thanh toán',
  ref_no: 'Mã giao dịch',
  discount: 'Giảm giá',

  // chi phí
  category: 'Loại chi phí',
  spent_at: 'Ngày chi',
  vendor: 'Nhà cung cấp',

  // cấu hình
  due_days: 'Số ngày tới hạn',
  default_price: 'Giá mặc định',
} as const

/** Khoá field đã khai. Truyền khoá lạ vào `check()` sẽ bị tsc chặn. */
export type FieldKey = keyof typeof FIELD

/**
 * Khuôn thông điệp. `{field}` là nhãn, các `{tên}` khác lấy từ tham số.
 */
export const MESSAGE = {
  required: '{field} không được để trống',
  number: '{field} phải là số',
  positive: '{field} phải lớn hơn 0',
  notNegative: '{field} không được âm',
  max: '{field} không được vượt quá {max}',
  min: '{field} không được nhỏ hơn {min}',
  lessThanPrev: '{field} nhỏ hơn số cũ ({prev}) — kiểm tra lại',
  dateFuture: '{field} không được ở tương lai',
  dateAfter: '{field} phải sau {other}',
  phone: '{field} không hợp lệ (bắt đầu bằng 0, 9–11 chữ số)',
  idCard: '{field} phải 12 số (CCCD) hoặc 9 số (CMND)',

  // thông báo chung, không gắn field
  formInvalid: 'Còn ô nhập chưa hợp lệ — kiểm tra lại các ô bôi đỏ',
  stepIncomplete: 'Bước {step} còn thiếu thông tin',
  nothingEntered: 'Chưa nhập ô nào',

  // màn ghi số — có tiền tố {where} để biết dòng nào của bảng
  readNotNumber: '{where}: không phải số',
  readNegative: '{where}: không được âm',
  readBilled: '{where}: đã chốt sổ, không sửa được',
  readRollover: '{where}: số mới nhỏ hơn số cũ — đang tính là đồng hồ quay vòng',
  readZero: '{where}: tiêu thụ 0 dù phòng đang có người',
  readTooHigh: '{where}: {value} — cao gấp {times} lần trung bình ({average})',
} as const

export type MessageKey = keyof typeof MESSAGE

/** Nhãn có thể là khoá đã khai, hoặc chuỗi tự do khi cần ghi đè. */
export type FieldOrLabel = FieldKey | string

/** Giá trị thay vào chỗ trống của khuôn thông điệp. */
export type MessageParams = Record<string, string | number>

/** Nhãn của field; không có trong từ điển thì trả về chính key để còn nhận ra. */
export function label(field: FieldOrLabel): string {
  return (FIELD as Record<string, string>)[field] ?? field
}

/**
 * Dựng thông điệp: msg('max', 'deduction', { max: '2.000.000đ' })
 *   → "Tiền trừ cọc không được vượt quá 2.000.000đ"
 */
export function msg(
  key: MessageKey,
  field: FieldOrLabel | null = null,
  params: MessageParams = {},
): string {
  let template: string = MESSAGE[key]

  const values: MessageParams = { field: field ? label(field) : '', ...params }

  for (const [name, value] of Object.entries(values)) {
    template = template.replaceAll(`{${name}}`, String(value))
  }

  return template.trim()
}
