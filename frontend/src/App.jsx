import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/ui'
import { ConfirmProvider } from './components/confirm'
import Dashboard from './pages/Dashboard'
import Readings from './pages/Readings'
import Billing from './pages/Billing'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import Contracts from './pages/Contracts'
import MoveIn from './pages/MoveIn'
import MoveOut from './pages/MoveOut'
import Expenses from './pages/Expenses'
import Report from './pages/Report'
import Settings from './pages/Settings'

const NAV = [
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/readings', label: 'Ghi số' },
  { to: '/billing', label: 'Chốt sổ' },
  { to: '/invoices', label: 'Hoá đơn' },
  { to: '/contracts', label: 'Hợp đồng' },
  { to: '/expenses', label: 'Chi phí' },
  { to: '/report', label: 'Báo cáo' },
  { to: '/settings', label: 'Cấu hình' },
]

function Layout({ children }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Nhà<span className="text-sky-600">Trọ</span>
          </span>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/readings" element={<Readings />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/contracts/move-in/:roomId" element={<MoveIn />} />
              <Route path="/contracts/:id/move-out" element={<MoveOut />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/report" element={<Report />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  )
}
