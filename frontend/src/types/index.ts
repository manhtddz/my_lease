/**
 * Điểm nhập duy nhất cho type: `import type { Invoice, InvoiceStatus } from '@/types'`.
 *
 * Chia ba tầng:
 *   codes.ts   mã CHAR(1) + nhãn — đối chiếu App\Enums\Code
 *   domain.ts  thực thể nghiệp vụ — đối chiếu model Eloquent
 *   api.ts     payload và response từng endpoint
 */
export * from './codes'
export * from './domain'
export * from './api'
