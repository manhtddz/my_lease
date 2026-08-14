import axios, { type AxiosError } from 'axios'
import type {
  BillingCommitResponse,
  BillingPreviewResponse,
  BuildingListResponse,
  BulkReadingPayload,
  BulkReadingResponse,
  CancelContractPayload,
  CancelContractResponse,
  ContractDetailResponse,
  ContractListResponse,
  ContractStatus,
  CreateExpensePayload,
  CreateRoomPayload,
  DeletedResponse,
  Expense,
  ExpenseListResponse,
  Invoice,
  InvoiceDetailResponse,
  InvoiceListQuery,
  InvoiceListResponse,
  IsoDate,
  IssuedAllResponse,
  MetaResponse,
  MonthlyReportResponse,
  MoveInDefaultsResponse,
  MoveInPayload,
  MoveInResponse,
  MoveOutPayload,
  MoveOutPreviewResponse,
  MoveOutResponse,
  PaymentCreatedResponse,
  PaymentPayload,
  PeriodYm,
  ReadingListResponse,
  ReadingSheetResponse,
  Room,
  RoomListResponse,
  RoomPayload,
  ServiceItem,
  ServiceItemListResponse,
  SettingsResponse,
  SettingsUpdatedResponse,
  TenantListResponse,
  UnbilledListResponse,
  UpdateDetailsPayload,
  UpdateDetailsResponse,
  UpdateInvoicePayload,
} from '@/types'
import type { DashboardResponse } from '@/types'

const client = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
})

/** Một dòng lỗi của endpoint xử lý hàng loạt, ví dụ /readings/bulk. */
interface RowError {
  message?: string
}

/**
 * Hình dạng lỗi backend trả về — có hai kiểu:
 *   - validate của Laravel: `{ field: ['câu lỗi', ...] }`
 *   - lỗi theo dòng của endpoint hàng loạt: `[{ meter_id, message }, ...]`
 */
interface ApiError {
  message?: string
  errors?: Record<string, string[]> | Array<RowError | string>
}

/** Gom mọi hình dạng lỗi về một chuỗi đọc được. */
function readErrorMessage(data: ApiError | undefined, fallback: string): string {
  if (data?.message) return data.message

  const { errors } = data ?? {}
  if (!errors) return fallback

  const lines = Array.isArray(errors)
    ? errors.map((e) => (typeof e === 'string' ? e : e?.message)).filter(Boolean)
    : Object.values(errors).flat()

  // Không join mảng object thô: ra "[object Object]" thay vì câu tiếng Việt.
  return lines.length ? lines.join('\n') : fallback
}

/** Ném ra message tiếng Việt từ backend thay vì "Request failed with status 422". */
client.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiError>) => {
    const message = readErrorMessage(error.response?.data, error.message)
    return Promise.reject(new Error(message))
  },
)

/** Query string — axios tự bỏ key có giá trị undefined. */
type Query = Record<string, unknown> | object

/** Lấy `data` ra khỏi response, gõ kiểu một lần cho mọi endpoint. */
const get = <T>(url: string, params?: Query): Promise<T> =>
  client.get<T>(url, { params }).then((r) => r.data)

const post = <T>(url: string, body?: unknown): Promise<T> =>
  client.post<T>(url, body).then((r) => r.data)

const put = <T>(url: string, body?: unknown): Promise<T> =>
  client.put<T>(url, body).then((r) => r.data)

const del = <T>(url: string, body?: unknown): Promise<T> =>
  client.delete<T>(url, { data: body }).then((r) => r.data)

export const api = {
  meta: () => get<MetaResponse>('/meta'),
  dashboard: (period?: PeriodYm) => get<DashboardResponse>('/dashboard', { period }),

  // --- ghi số ---
  readingSheet: (period?: PeriodYm) => get<ReadingSheetResponse>('/readings/sheet', { period }),
  saveReadings: (payload: BulkReadingPayload) =>
    post<BulkReadingResponse>('/readings/bulk', payload),
  readings: (params?: { room_id?: number; period?: PeriodYm }) =>
    get<ReadingListResponse>('/readings', params),
  unbilled: (roomId?: number) => get<UnbilledListResponse>('/readings/unbilled', { room_id: roomId }),
  deleteReading: (id: number) => del<DeletedResponse>(`/readings/${id}`),

  // --- chốt sổ ---
  billingPreview: (period?: PeriodYm) => get<BillingPreviewResponse>('/billing/preview', { period }),
  /** Bỏ trống contractIds / expenseRoomIds = chốt cả kỳ. */
  billingCommit: (
    period_ym: PeriodYm,
    contract_ids: number[] | null = null,
    expense_room_ids: (number | null)[] | null = null,
  ) => post<BillingCommitResponse>('/billing/commit', { period_ym, contract_ids, expense_room_ids }),

  // --- hoá đơn ---
  invoices: (params?: InvoiceListQuery) => get<InvoiceListResponse>('/invoices', params),
  invoice: (id: number | string) => get<InvoiceDetailResponse>(`/invoices/${id}`),
  updateInvoice: (id: number | string, payload: UpdateInvoicePayload) =>
    put<Invoice>(`/invoices/${id}`, payload),
  updateInvoiceDetails: (id: number | string, payload: UpdateDetailsPayload) =>
    put<UpdateDetailsResponse>(`/invoices/${id}/details`, payload),
  issueInvoice: (id: number | string) => post<Invoice>(`/invoices/${id}/issue`),
  issueAll: (period_ym: PeriodYm) => post<IssuedAllResponse>('/invoices/issue-all', { period_ym }),
  deleteInvoice: (id: number | string, reason?: string | null) =>
    del<DeletedResponse | Invoice>(`/invoices/${id}`, { reason }),
  pay: (id: number | string, payload: PaymentPayload) =>
    post<PaymentCreatedResponse>(`/invoices/${id}/payments`, payload),
  deletePayment: (id: number) => del<DeletedResponse>(`/payments/${id}`),

  // --- hợp đồng ---
  contracts: (params?: { status?: ContractStatus; room_id?: number }) =>
    get<ContractListResponse>('/contracts', params),
  contract: (id: number | string) => get<ContractDetailResponse>(`/contracts/${id}`),
  moveInDefaults: (room_id: number | string) =>
    get<MoveInDefaultsResponse>('/contracts/move-in-defaults', { room_id }),
  moveIn: (payload: MoveInPayload) => post<MoveInResponse>('/contracts/move-in', payload),
  cancelContract: (id: number | string, payload: CancelContractPayload) =>
    post<CancelContractResponse>(`/contracts/${id}/cancel`, payload),
  moveOutPreview: (id: number | string, end_date: IsoDate) =>
    get<MoveOutPreviewResponse>(`/contracts/${id}/move-out-preview`, { end_date }),
  moveOut: (id: number | string, payload: MoveOutPayload) =>
    post<MoveOutResponse>(`/contracts/${id}/move-out`, payload),

  // --- phòng ---
  buildings: () => get<BuildingListResponse>('/buildings'),
  rooms: () => get<RoomListResponse>('/rooms'),
  createRoom: (payload: CreateRoomPayload) => post<Room>('/rooms', payload),
  updateRoom: (id: number, payload: RoomPayload) => put<Room>(`/rooms/${id}`, payload),
  deleteRoom: (id: number) => del<DeletedResponse>(`/rooms/${id}`),

  // --- danh mục / chi phí / cấu hình / báo cáo ---
  tenants: () => get<TenantListResponse>('/tenants'),
  expenses: (params?: { period?: PeriodYm }) => get<ExpenseListResponse>('/expenses', params),
  createExpense: (payload: CreateExpensePayload) => post<Expense>('/expenses', payload),
  deleteExpense: (id: number) => del<DeletedResponse>(`/expenses/${id}`),
  serviceItems: () => get<ServiceItemListResponse>('/service-items'),
  updateServiceItem: (id: number, payload: Partial<Pick<ServiceItem, 'name' | 'default_price' | 'is_active'>>) =>
    put<ServiceItem>(`/service-items/${id}`, payload),
  settings: () => get<SettingsResponse>('/settings'),
  updateSettings: (values: Record<string, string>) =>
    put<SettingsUpdatedResponse>('/settings', { values }),
  monthlyReport: (months = 12) => get<MonthlyReportResponse>('/reports/monthly', { months }),
}
