import type {
  ContractStatus,
  ExpenseCategory,
  Gender,
  InvoiceStatus,
  MeterType,
  PaymentKind,
  PaymentMethod,
  PricingMode,
  ReadReason,
  RoomStatus,
} from './codes'

/**
 * Thực thể nghiệp vụ — đối chiếu với các model Eloquent ở backend.
 *
 * Quy ước:
 *   - Ngày tháng là `string` dạng 'YYYY-MM-DD' (backend cast date:Y-m-d),
 *     không phải Date. Không tự parse thành Date để tránh lệch múi giờ.
 *   - Tiền là `number`, đơn vị đồng, luôn nguyên.
 *   - Chỉ số đồng hồ là `number`, có thể lẻ (nước).
 *   - `| null` là field backend trả null thật; `?` là field có thể vắng mặt.
 */

/** Kỳ tính tiền dạng 'YYYYMM'. Đặt alias để đọc code biết ngay ý nghĩa. */
export type PeriodYm = string

/** Ngày dạng 'YYYY-MM-DD'. */
export type IsoDate = string

// ------------------------------------------------------------------ tài sản

export interface Building {
  id: number
  name: string
}

export interface Room {
  id: number
  code: string
  building_id: number
  building_name: string
  status: RoomStatus
  default_rent: number
}

// --------------------------------------------------------- người thuê & HĐ

export interface Tenant {
  id: number
  full_name: string
  phone: string | null
  id_card_no: string | null
  dob: IsoDate | null
  gender: Gender | null
  hometown: string | null
  email: string | null
  note: string | null
}

export interface ContractOccupant {
  id: number
  contract_id: number
  full_name: string
  id_card_no: string | null
  dob: IsoDate | null
  phone: string | null
  relationship: string | null
  moved_in_at: IsoDate | null
  moved_out_at: IsoDate | null
  is_registered: boolean
  note: string | null
}

export interface Contract {
  id: number
  code: string | null
  room_id: number
  room_code: string
  building_name: string
  start_date: IsoDate
  end_date: IsoDate | null
  actual_end_date: IsoDate | null
  /** Nguồn duy nhất của tiền phòng — không nằm trong contract_services. */
  rent_amount: number
  deposit_amount: number
  /** Cọc còn giữ = đã thu trừ đã hoàn. */
  deposit_held: number
  occupant_count: number
  status: ContractStatus
  note: string | null
}

/** Dòng trong danh sách hợp đồng — phẳng hơn Contract, kèm thông tin khách. */
export interface ContractListRow {
  id: number
  code: string | null
  room_code: string
  building_name: string
  tenant_name: string | null
  tenant_phone: string | null
  start_date: IsoDate
  end_date: IsoDate | null
  actual_end_date: IsoDate | null
  rent_amount: number
  deposit_amount: number
  deposit_held: number
  occupant_count: number
  status: ContractStatus
}

export interface ContractService {
  id: number
  service_item_id: number
  name: string | null
  pricing_mode: PricingMode | null
  unit_label: string | null
  unit_price: number
  quantity_fixed: number | null
  is_active: boolean
}

// ------------------------------------------------------------------ đồng hồ

export interface ServiceItem {
  id: number
  code: string
  name: string
  pricing_mode: PricingMode
  meter_type: MeterType | null
  unit_label: string | null
  default_price: number
  /** false = không được đưa vào contract_services, vd tiền phòng. */
  is_service: boolean
  is_active: boolean
  sort_order: number
}

/** Một mắt xích trong chuỗi đọc đồng hồ. */
export interface MeterReading {
  id: number
  room_code: string
  meter_type: MeterType
  read_date: IsoDate
  prev_read_date: IsoDate | null
  prev_reading: number
  reading: number
  /** Lưu trực tiếp, không suy ra từ hiệu hai chỉ số (quay vòng, thay đồng hồ). */
  consumption: number
  reason: ReadReason
  period_ym: PeriodYm
  is_billed: boolean
  charge_to: string
  note: string | null
}

// -------------------------------------------------------------------- hoá đơn

export interface Invoice {
  id: number
  code: string | null
  contract_id: number
  room_id: number
  room_code: string | null
  building_name: string | null
  tenant_name: string | null
  period_ym: PeriodYm
  period_from: IsoDate
  period_to: IsoDate
  issue_date: IsoDate
  due_date: IsoDate | null
  subtotal: number
  discount: number
  /** Nợ các kỳ trước chuyển sang. */
  carried_over: number
  total: number
  paid_amount: number
  remaining: number
  is_settlement: boolean
  status: InvoiceStatus
  note: string | null
  /** Còn sửa được chi tiết không — true khi chưa thu đồng nào. */
  editable: boolean
  /** Lý do bị khoá, null khi editable. */
  lock_reason: string | null
}

export interface InvoiceDetail {
  id: number
  service_name: string | null
  description: string
  quantity: number
  unit_price: number
  amount: number
  /** Trỏ về chỉ số đồng hồ làm bằng chứng, null với khoản không theo đồng hồ. */
  meter_reading_id: number | null
}

export interface Payment {
  id: number
  amount: number
  paid_at: IsoDate
  method: PaymentMethod
  kind: PaymentKind
  ref_no: string | null
  note: string | null
}

// -------------------------------------------------------------------- chi phí

export interface Expense {
  id: number
  category: ExpenseCategory
  period_ym: PeriodYm | null
  amount: number
  spent_at: IsoDate
  vendor: string | null
  room_code: string | null
  building_name: string | null
  note: string | null
}
