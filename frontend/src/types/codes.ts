/**
 * Mã phân loại CHAR(1) — bản đối chiếu của App\Enums\Code ở backend.
 *
 * Dùng object `as const` + union type thay cho `enum` của TypeScript, vì dữ liệu
 * đến từ JSON dưới dạng chuỗi thô: `enum` sẽ buộc phải cast ở mọi ranh giới API,
 * còn union thì gán trực tiếp được mà vẫn chặn giá trị lạ khi compile.
 *
 * Đổi mã ở backend thì phải đổi ở đây — bù lại, `Record<Union, string>` bên dưới
 * bắt buộc khai đủ nhãn cho mọi mã, nên thêm mã mà quên nhãn là lỗi compile,
 * không phải `undefined` hiện lên UI.
 */

// ----------------------------------------------------------------- toà nhà

export const BuildingType = {
  BoardingHouse: '1',
  Apartment: '2',
} as const
export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType]

// -------------------------------------------------------------------- phòng

export const RoomStatus = {
  Vacant: '1',
  Occupied: '2',
  Maintenance: '3',
} as const
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus]

// --------------------------------------------------------------- người thuê

export const Gender = {
  Male: '1',
  Female: '2',
  Other: '3',
} as const
export type Gender = (typeof Gender)[keyof typeof Gender]

// ----------------------------------------------------------------- hợp đồng

export const ContractStatus = {
  Draft: '1',
  Active: '2',
  Ended: '3',
  Cancelled: '4',
} as const
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus]

// ------------------------------------------------------------------ đồng hồ

export const MeterType = {
  Electric: '1',
  Water: '2',
} as const
export type MeterType = (typeof MeterType)[keyof typeof MeterType]

export const ReadReason = {
  Monthly: '1',
  MoveIn: '2',
  MoveOut: '3',
  MeterChange: '4',
  Adjustment: '5',
} as const
export type ReadReason = (typeof ReadReason)[keyof typeof ReadReason]

// -------------------------------------------------------------- khoản thu

export const PricingMode = {
  Fixed: '1',
  PerUnit: '2',
  PerPerson: '3',
  PerDay: '4',
} as const
export type PricingMode = (typeof PricingMode)[keyof typeof PricingMode]

// -------------------------------------------------------------------- hoá đơn

export const InvoiceStatus = {
  Draft: '1',
  Issued: '2',
  Partial: '3',
  Paid: '4',
  Void: '5',
} as const
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]

// ------------------------------------------------------------------- thu tiền

export const PaymentKind = {
  Rent: '1',
  DepositIn: '2',
  DepositRefund: '3',
  Other: '4',
} as const
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind]

export const PaymentMethod = {
  Cash: '1',
  Transfer: '2',
  Other: '3',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

// -------------------------------------------------------------------- chi phí

export const ExpenseCategory = {
  Utility: '1',
  Repair: '2',
  Tax: '3',
  Equipment: '4',
  Internet: '5',
  Other: '6',
} as const
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory]

// ---------------------------------------------------------------------- nhãn

/**
 * Nhãn tiếng Việt. `Record<Union, string>` là chỗ trả lãi: thêm một mã vào union
 * mà quên nhãn thì tsc báo lỗi ngay tại đây.
 */
export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  [RoomStatus.Vacant]: 'Trống',
  [RoomStatus.Occupied]: 'Đang thuê',
  [RoomStatus.Maintenance]: 'Bảo trì',
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  [ContractStatus.Draft]: 'Nháp',
  [ContractStatus.Active]: 'Hiệu lực',
  [ContractStatus.Ended]: 'Đã kết thúc',
  [ContractStatus.Cancelled]: 'Đã huỷ',
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  [InvoiceStatus.Draft]: 'Nháp',
  [InvoiceStatus.Issued]: 'Đã phát hành',
  [InvoiceStatus.Partial]: 'Trả một phần',
  [InvoiceStatus.Paid]: 'Đã trả đủ',
  [InvoiceStatus.Void]: 'Đã huỷ',
}

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  [PaymentKind.Rent]: 'Tiền thuê / dịch vụ',
  [PaymentKind.DepositIn]: 'Thu cọc',
  [PaymentKind.DepositRefund]: 'Hoàn cọc',
  [PaymentKind.Other]: 'Khác',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.Cash]: 'Tiền mặt',
  [PaymentMethod.Transfer]: 'Chuyển khoản',
  [PaymentMethod.Other]: 'Khác',
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  [ExpenseCategory.Utility]: 'Hoá đơn tiện ích',
  [ExpenseCategory.Repair]: 'Sửa chữa',
  [ExpenseCategory.Tax]: 'Thuế',
  [ExpenseCategory.Equipment]: 'Thiết bị',
  [ExpenseCategory.Internet]: 'Internet',
  [ExpenseCategory.Other]: 'Khác',
}

export const PRICING_MODE_LABEL: Record<PricingMode, string> = {
  [PricingMode.Fixed]: 'Cố định',
  [PricingMode.PerUnit]: 'Theo chỉ số',
  [PricingMode.PerPerson]: 'Theo đầu người',
  [PricingMode.PerDay]: 'Theo ngày',
}

export const READ_REASON_LABEL: Record<ReadReason, string> = {
  [ReadReason.Monthly]: 'Định kỳ',
  [ReadReason.MoveIn]: 'Khách vào',
  [ReadReason.MoveOut]: 'Khách ra',
  [ReadReason.MeterChange]: 'Thay đồng hồ',
  [ReadReason.Adjustment]: 'Điều chỉnh',
}

export const METER_TYPE_LABEL: Record<MeterType, string> = {
  [MeterType.Electric]: 'Điện',
  [MeterType.Water]: 'Nước',
}

/** Đơn vị đo theo loại đồng hồ — dùng khi hiển thị số tiêu thụ. */
export const METER_UNIT: Record<MeterType, string> = {
  [MeterType.Electric]: 'kWh',
  [MeterType.Water]: 'm³',
}

// ------------------------------------------------------------- màu badge

export type Tone = 'slate' | 'green' | 'amber' | 'rose' | 'sky'

export const INVOICE_TONE: Record<InvoiceStatus, Tone> = {
  [InvoiceStatus.Draft]: 'slate',
  [InvoiceStatus.Issued]: 'sky',
  [InvoiceStatus.Partial]: 'amber',
  [InvoiceStatus.Paid]: 'green',
  [InvoiceStatus.Void]: 'rose',
}

export const ROOM_TONE: Record<RoomStatus, Tone> = {
  [RoomStatus.Vacant]: 'slate',
  [RoomStatus.Occupied]: 'green',
  [RoomStatus.Maintenance]: 'amber',
}

export const CONTRACT_TONE: Record<ContractStatus, Tone> = {
  [ContractStatus.Draft]: 'slate',
  [ContractStatus.Active]: 'green',
  [ContractStatus.Ended]: 'slate',
  [ContractStatus.Cancelled]: 'rose',
}
