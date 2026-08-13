import type {
  ExpenseCategory,
  MeterType,
  PaymentMethod,
  PricingMode,
  ReadReason,
  RoomStatus,
} from './codes'
import type {
  Contract,
  ContractListRow,
  ContractOccupant,
  ContractService,
  Expense,
  Invoice,
  InvoiceDetail,
  IsoDate,
  MeterReading,
  Payment,
  PeriodYm,
  Room,
  ServiceItem,
  Tenant,
} from './domain'

/**
 * Hợp đồng dữ liệu với API — mỗi endpoint một cặp payload/response.
 *
 * CẢNH BÁO: những type này viết tay, TypeScript không tự biết Laravel trả gì.
 * Sửa response ở controller thì phải sửa file này TRONG CÙNG COMMIT, nếu không
 * bạn có cảm giác an toàn giả — tệ hơn là không có type.
 */

/** Danh sách trả về dạng `{ rows: [...] }` — quy ước chung của mọi endpoint list. */
export interface Rows<T> {
  rows: T[]
}

// ---------------------------------------------------------------------- meta

export interface MetaResponse {
  labels: Record<string, Record<string, string>>
  today: IsoDate
  current_period: PeriodYm
}

// ----------------------------------------------------------------- dashboard

export type BannerLevel = 'danger' | 'warning' | 'info' | 'success'
export type BannerAction = 'read' | 'billing' | 'invoices'

/** Dải cảnh báo trên dashboard — nói rõ việc tiếp theo phải làm. */
export interface Banner {
  level: BannerLevel
  message: string
  action: BannerAction
  action_label: string
  period: PeriodYm
}

export interface PeriodSummary {
  income: number
  expense: number
  profit: number
  collected: number
  outstanding: number
}

/** Hợp đồng đang hiệu lực, gắn trên thẻ phòng ở dashboard. */
export interface DashboardContract {
  id: number
  code: string | null
  tenant_name: string | null
  tenant_phone: string | null
  rent_amount: number
  start_date: IsoDate
  occupant_count: number
}

export interface DashboardRoom {
  id: number
  code: string
  building_name: string
  building_id: number
  status: RoomStatus
  default_rent: number
  contract: DashboardContract | null
  debt: number
  has_reading_this_period: boolean
}

export interface DashboardResponse {
  period_ym: PeriodYm
  rooms: DashboardRoom[]
  banner: Banner
  summary: PeriodSummary
}

// ------------------------------------------------------------------- ghi số

/** Chỉ số đã lưu cho kỳ này, nếu có. */
export interface ExistingReading {
  id: number
  reading: number
  consumption: number
  is_billed: boolean
  read_date: IsoDate
}

export interface SheetMeter {
  meter_id: number
  type: MeterType
  /** Số chữ số trên mặt đồng hồ — dùng tính quay vòng. */
  digits: number
  prev_reading: number
  prev_read_date: IsoDate
  prev_reading_id: number | null
  /** Trung bình 6 kỳ gần nhất, null khi chưa có lịch sử. */
  avg_consumption: number | null
  existing: ExistingReading | null
}

export interface SheetRow {
  room_id: number
  room_code: string
  building_name: string
  room_status: RoomStatus
  meters: SheetMeter[]
  contract_id: number | null
  charge_to: string
  /** true khi phòng đổi khách trong kỳ — phải dùng wizard, không ghi hàng loạt. */
  blocked: boolean
  blocked_reason: string | null
}

export interface ReadingSheetResponse {
  period_ym: PeriodYm
  default_read_date: IsoDate
  rows: SheetRow[]
}

export interface BulkReadingEntry {
  meter_id: number
  reading: number
  meter_changed?: boolean
  note?: string | null
}

export interface BulkReadingPayload {
  period_ym: PeriodYm
  read_date: IsoDate
  entries: BulkReadingEntry[]
}

export interface ReadingError {
  meter_id: number
  message: string
}

export interface BulkReadingResponse {
  saved: number
  skipped: number
  errors: ReadingError[]
}

export interface UnbilledReading {
  id: number
  room_id: number
  meter_type: MeterType
  read_date: IsoDate
  consumption: number
  contract_id: number | null
  /** Đoạn tiêu thụ sẽ thành hoá đơn hay chi phí chủ nhà. */
  destination: 'invoice' | 'expense'
  reason: ReadReason
}

// ------------------------------------------------------------------ chốt sổ

/** Một dòng trong hoá đơn nháp, chưa ghi DB. */
export interface DraftLine {
  service_item_id: number
  description: string
  meter_reading_id?: number | null
  quantity: number
  unit_price: number
  amount: number
}

export interface InvoiceDraft {
  contract_id: number
  room_id: number
  room_code: string
  building_name: string
  tenant_name: string | null
  period_from: IsoDate
  period_to: IsoDate
  details: DraftLine[]
  reading_ids: number[]
  subtotal: number
  carried_over: number
  total: number
}

/** Đoạn tiêu thụ lúc phòng trống — thành chi phí chủ nhà, không tính cho khách. */
export interface OwnerExpenseDraft {
  room_id: number | null
  building_id: number | null
  room_code: string | null
  description: string
  quantity: number
  unit_price: number
  amount: number
  reading_ids: number[]
}

export interface BillingWarning {
  level: 'warning' | 'danger'
  message: string
}

export interface BillingPreviewResponse {
  period_ym: PeriodYm
  period_from: IsoDate
  period_to: IsoDate
  invoices: InvoiceDraft[]
  owner_expenses: OwnerExpenseDraft[]
  warnings: BillingWarning[]
  total: number
}

export interface BillingCommitResponse {
  invoice_ids: number[]
  invoice_count: number
  expense_count: number
}

// -------------------------------------------------------------------- hoá đơn

export interface OwnerInfo {
  name: string | null
  phone: string | null
  bank_account: string | null
  bank_name: string | null
  invoice_note: string | null
}

export interface InvoiceDetailResponse {
  invoice: Invoice
  details: InvoiceDetail[]
  payments: Payment[]
  owner: OwnerInfo
}

export interface InvoiceListQuery {
  period?: PeriodYm
  status?: string
  room_id?: string | number
  outstanding?: boolean
}

export interface UpdateInvoicePayload {
  discount?: number
  note?: string | null
}

export interface UpdateDetailLine {
  id: number
  quantity: number
  unit_price: number
}

export interface UpdateDetailsPayload {
  details: UpdateDetailLine[]
  discount?: number
  note?: string | null
}

/** Chỉ số đã được ghi ngược khi sửa hoá đơn. */
export interface SyncedReading {
  reading_id: number
  from: number
  to: number
  new_reading: number
}

export interface UpdateDetailsResponse {
  invoice: Invoice
  synced: SyncedReading[]
  /** Mô tả các dòng không đồng bộ được (gộp nhiều lần đọc). */
  unsynced: string[]
}

export interface PaymentPayload {
  amount: number
  paid_at: IsoDate
  method: PaymentMethod
  ref_no?: string | null
  note?: string | null
}

// ------------------------------------------------------------------ hợp đồng

export interface ContractDetailResponse {
  contract: Contract
  tenant: Tenant | null
  occupants: ContractOccupant[]
  services: ContractService[]
  invoices: Pick<Invoice, 'id' | 'code' | 'period_ym' | 'total' | 'paid_amount' | 'status'>[]
  payments: Pick<Payment, 'id' | 'kind' | 'amount' | 'paid_at' | 'note'>[]
}

/** Khoản dịch vụ gợi ý khi tạo hợp đồng, giá lấy từ service_items.default_price. */
export interface ServiceDefault {
  service_item_id: number
  code: string
  name: string
  pricing_mode: PricingMode
  unit_label: string | null
  unit_price: number
  /** true = tick sẵn (điện, nước, rác). */
  suggested: boolean
}

export interface MeterSnapshot {
  meter_id: number
  type: MeterType
  prev_reading: number
  prev_read_date: IsoDate
}

export interface MoveInDefaultsResponse {
  room: Pick<Room, 'id' | 'code' | 'building_name' | 'default_rent' | 'status'>
  services: ServiceDefault[]
  meters: MeterSnapshot[]
  today: IsoDate
}

export interface MoveInTenantPayload {
  full_name: string
  phone?: string | null
  id_card_no?: string | null
  dob?: IsoDate | null
  gender?: string | null
  hometown?: string | null
}

export interface MoveInOccupantPayload {
  full_name: string
  id_card_no?: string | null
  dob?: IsoDate | null
  phone?: string | null
  relationship?: string | null
}

export interface MoveInServicePayload {
  service_item_id: number
  unit_price: number
  quantity_fixed?: number | null
}

export interface MeterReadingPayload {
  meter_id: number
  reading: number
}

export interface MoveInPayload {
  room_id: number
  tenant_id?: number
  tenant?: MoveInTenantPayload
  start_date: IsoDate
  end_date?: IsoDate | null
  rent_amount: number
  deposit_amount?: number
  occupant_count?: number
  note?: string | null
  occupants?: MoveInOccupantPayload[]
  services?: MoveInServicePayload[]
  /** Bắt buộc — điểm khởi đầu chuỗi đọc của khách mới. */
  meter_readings: MeterReadingPayload[]
}

export interface MoveInResponse {
  contract_id: number
  code: string | null
}

export interface MoveOutPreviewResponse {
  contract_id: number
  room_code: string
  tenant_name: string | null
  period_from: IsoDate
  period_to: IsoDate
  days: number
  rent_amount: number
  deposit_held: number
  carried_over: number
  meters: MeterSnapshot[]
}

export interface MoveOutPayload {
  end_date: IsoDate
  meter_readings: MeterReadingPayload[]
  discount?: number
  deposit_deduction?: number
  deduction_reason?: string | null
  refund_deposit?: boolean
  refund_method?: string
  note?: string | null
}

export interface MoveOutResponse {
  invoice_id: number
  code: string | null
}

// ------------------------------------------------------------------- chi phí

export interface CreateExpensePayload {
  category: ExpenseCategory
  amount: number
  spent_at: IsoDate
  period_ym?: PeriodYm | null
  building_id?: number | null
  room_id?: number | null
  vendor?: string | null
  note?: string | null
}

// ------------------------------------------------------------------ cấu hình

export interface SettingEntry {
  value: string | null
  note: string | null
}

export interface SettingsResponse {
  rows: Record<string, SettingEntry>
}

// -------------------------------------------------------------------- báo cáo

export interface MonthlyReportRow {
  period_ym: PeriodYm
  label: string
  income: number
  collected: number
  expense: number
  profit: number
}

// ------------------------------------------------------- kiểu phụ dùng lại

export type RoomListResponse = Rows<Room>
export type TenantListResponse = Rows<Tenant>
export type InvoiceListResponse = Rows<Invoice>
export type ContractListResponse = Rows<ContractListRow>
export type ReadingListResponse = Rows<MeterReading>
export type UnbilledListResponse = Rows<UnbilledReading>
export type ExpenseListResponse = Rows<Expense>
export type ServiceItemListResponse = Rows<ServiceItem>
export type MonthlyReportResponse = Rows<MonthlyReportRow>

export interface DeletedResponse {
  deleted: boolean
}

export interface IssuedAllResponse {
  issued: number
}

export interface PaymentCreatedResponse {
  payment_id: number
}

export interface SettingsUpdatedResponse {
  updated: number
}
