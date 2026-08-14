import { canAdvancePeriod, currentPeriod, nextPeriod, period, prevPeriod } from '@/lib/format'
import type { PeriodYm } from '@/types'

export interface PeriodNavProps {
  /** null = đang xem tất cả kỳ (chỉ hợp lệ khi bật `allowAll`). */
  value: PeriodYm | null
  onChange: (value: PeriodYm | null) => void
  /**
   * Cho phép trạng thái "tất cả kỳ" — cần cho danh sách hoá đơn, nơi phải xem
   * được công nợ cũ của một phòng mà không biết nó thuộc kỳ nào.
   */
  allowAll?: boolean
  className?: string
}

/**
 * Điều hướng kỳ bằng nút ‹ ›.
 *
 * Không dùng input type=month vì lịch mở ra cho chọn cả kỳ tương lai — nơi
 * chắc chắn không có số liệu — rồi người dùng phải tự hiểu vì sao trang trống.
 * Nút › tự tắt ở kỳ hiện tại nên không đi tới đó được.
 */
export function PeriodNav({ value, onChange, allowAll = false, className = '' }: PeriodNavProps) {
  const canNext = value !== null && canAdvancePeriod(value)

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        className="btn-ghost px-2 py-1"
        title="Kỳ trước"
        onClick={() => onChange(value === null ? currentPeriod() : prevPeriod(value))}
      >
        ‹
      </button>

      <span className="min-w-24 text-center text-sm font-semibold tabular-nums">
        {value === null ? 'Tất cả kỳ' : `Kỳ ${period(value)}`}
      </span>

      <button
        type="button"
        className="btn-ghost px-2 py-1"
        title={canNext ? 'Kỳ sau' : 'Đã ở kỳ hiện tại'}
        disabled={!canNext}
        onClick={() => value !== null && onChange(nextPeriod(value))}
      >
        ›
      </button>

      {allowAll && value !== null && (
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          title="Bỏ lọc kỳ"
          onClick={() => onChange(null)}
        >
          Tất cả
        </button>
      )}
    </div>
  )
}
