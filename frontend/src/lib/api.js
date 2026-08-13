import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
})

/** Ném ra message tiếng Việt từ backend thay vì "Request failed with status 422". */
client.interceptors.response.use(
  (res) => res,
  (error) => {
    const data = error.response?.data
    const message =
      data?.message ||
      (data?.errors && Object.values(data.errors).flat().join('\n')) ||
      error.message
    return Promise.reject(new Error(message))
  },
)

export const api = {
  meta: () => client.get('/meta').then((r) => r.data),
  dashboard: (period) => client.get('/dashboard', { params: { period } }).then((r) => r.data),

  readingSheet: (period) => client.get('/readings/sheet', { params: { period } }).then((r) => r.data),
  saveReadings: (payload) => client.post('/readings/bulk', payload).then((r) => r.data),
  readings: (params) => client.get('/readings', { params }).then((r) => r.data),
  deleteReading: (id) => client.delete(`/readings/${id}`).then((r) => r.data),

  billingPreview: (period) => client.get('/billing/preview', { params: { period } }).then((r) => r.data),
  // Bỏ trống contract_ids / expense_room_ids = chốt cả kỳ.
  billingCommit: (period_ym, contract_ids = null, expense_room_ids = null) =>
    client.post('/billing/commit', { period_ym, contract_ids, expense_room_ids }).then((r) => r.data),

  invoices: (params) => client.get('/invoices', { params }).then((r) => r.data),
  invoice: (id) => client.get(`/invoices/${id}`).then((r) => r.data),
  updateInvoice: (id, payload) => client.put(`/invoices/${id}`, payload).then((r) => r.data),
  updateInvoiceDetails: (id, payload) => client.put(`/invoices/${id}/details`, payload).then((r) => r.data),
  issueInvoice: (id) => client.post(`/invoices/${id}/issue`).then((r) => r.data),
  issueAll: (period_ym) => client.post('/invoices/issue-all', { period_ym }).then((r) => r.data),
  deleteInvoice: (id, reason) => client.delete(`/invoices/${id}`, { data: { reason } }).then((r) => r.data),
  pay: (id, payload) => client.post(`/invoices/${id}/payments`, payload).then((r) => r.data),
  deletePayment: (id) => client.delete(`/payments/${id}`).then((r) => r.data),

  contracts: (params) => client.get('/contracts', { params }).then((r) => r.data),
  contract: (id) => client.get(`/contracts/${id}`).then((r) => r.data),
  moveInDefaults: (room_id) => client.get('/contracts/move-in-defaults', { params: { room_id } }).then((r) => r.data),
  moveIn: (payload) => client.post('/contracts/move-in', payload).then((r) => r.data),
  moveOutPreview: (id, end_date) =>
    client.get(`/contracts/${id}/move-out-preview`, { params: { end_date } }).then((r) => r.data),
  moveOut: (id, payload) => client.post(`/contracts/${id}/move-out`, payload).then((r) => r.data),
  updatePricing: (id, payload) => client.put(`/contracts/${id}/pricing`, payload).then((r) => r.data),

  rooms: () => client.get('/rooms').then((r) => r.data),
  expenses: (params) => client.get('/expenses', { params }).then((r) => r.data),
  createExpense: (payload) => client.post('/expenses', payload).then((r) => r.data),
  deleteExpense: (id) => client.delete(`/expenses/${id}`).then((r) => r.data),
  serviceItems: () => client.get('/service-items').then((r) => r.data),
  updateServiceItem: (id, payload) => client.put(`/service-items/${id}`, payload).then((r) => r.data),
  settings: () => client.get('/settings').then((r) => r.data),
  updateSettings: (values) => client.put('/settings', { values }).then((r) => r.data),
  monthlyReport: (months = 12) => client.get('/reports/monthly', { params: { months } }).then((r) => r.data),
}
