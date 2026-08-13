import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { money, moneyShort } from '../lib/format'
import { ErrorBox, Spinner } from '../components/ui'

export default function Report() {
  const { data, error, loading, reload } = useApi(() => api.monthlyReport(12), [])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const rows = data.rows
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)))
  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + r.income,
      collected: acc.collected + r.collected,
      expense: acc.expense + r.expense,
      profit: acc.profit + r.profit,
    }),
    { income: 0, collected: 0, expense: 0, profit: 0 },
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Báo cáo 12 tháng</h1>

      <div className="card p-5">
        <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ height: 200 }}>
          {rows.map((r) => (
            <div key={r.period_ym} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 150 }}>
                <div
                  className="w-1/2 rounded-t bg-sky-500"
                  style={{ height: `${(r.income / peak) * 100}%` }}
                  title={`Doanh thu ${money(r.income)}`}
                />
                <div
                  className="w-1/2 rounded-t bg-rose-400"
                  style={{ height: `${(r.expense / peak) * 100}%` }}
                  title={`Chi phí ${money(r.expense)}`}
                />
              </div>
              <span className="text-[10px] tabular-nums text-slate-500">{r.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm bg-sky-500" /> Doanh thu
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm bg-rose-400" /> Chi phí
          </span>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2 text-left">Tháng</th>
              <th className="px-3 py-2 text-right">Doanh thu</th>
              <th className="px-3 py-2 text-right">Đã thu</th>
              <th className="px-3 py-2 text-right">Chi phí</th>
              <th className="px-3 py-2 text-right">Lãi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.period_ym} className="hover:bg-slate-50">
                <td className="px-3 py-2 tabular-nums">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.income)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(r.collected)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-600">{money(r.expense)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">{money(r.profit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr>
              <td className="px-3 py-2">Tổng</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totals.income)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totals.collected)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-rose-600">{money(totals.expense)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{money(totals.profit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Doanh thu = tổng chi tiết hoá đơn trừ giảm giá, không cộng nợ kỳ trước (tránh tính hai lần).
        &nbsp;·&nbsp; Chênh giữa doanh thu và đã thu là công nợ: {moneyShort(totals.income - totals.collected)}.
      </p>
    </div>
  )
}
