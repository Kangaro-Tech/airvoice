import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 60_000, // 60s for large imports
});

// Inject Firebase ID token or Email JWT token on every request
api.interceptors.request.use(async (config) => {
  const { firebaseUser, getActiveToken } = useAuthStore.getState();
  if (firebaseUser) {
    try {
      const token = await firebaseUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
      useAuthStore.setState({ idToken: token });
    } catch { /* use cached token */ }
  } else {
    const token = getActiveToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Global error handling
api.interceptors.response.use(
  res => res,
  async (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Typed helpers ────────────────────────────────────────────

export const customersApi = {
  list:            (params: Record<string, unknown>) => api.get('/customers', { params }),
  get:             (id: string) => api.get(`/customers/${id}`),
  create:          (data: unknown) => api.post('/customers', data),
  update:          (id: string, data: unknown) => api.patch(`/customers/${id}`, data),
  checkDuplicate:  (data: unknown) => api.post('/customers/check-duplicate', data),
  checkEligibility:(id: string) => api.get(`/customers/${id}/phone-eligibility`),
  refreshRisk:     (id: string) => api.post(`/customers/${id}/refresh-risk`),
};

export const applicationsApi = {
  list:          (params: Record<string, unknown>) => api.get('/applications', { params }),
  get:           (id: string) => api.get(`/applications/${id}`),
  create:        (data: unknown) => api.post('/applications', data),
  submit:        (id: string) => api.post(`/applications/${id}/submit`),
  salesReview:   (id: string, data: unknown) => api.post(`/applications/${id}/sales-review`, data),
  campReview:    (id: string, data: unknown) => api.post(`/applications/${id}/camp-review`, data),
  financeReview: (id: string, data: unknown) => api.post(`/applications/${id}/finance-review`, data),
  adminApprove:  (id: string, data: unknown) => api.post(`/applications/${id}/admin-approve`, data),
  handover:      (id: string, data: unknown) => api.post(`/applications/${id}/handover`, data),
  specialApproval:(id: string, data: unknown) => api.post(`/applications/${id}/special-approval`, data),
};

export const deductionsApi = {
  getCampSheet:      (campId: string, year: number, month: number) =>
    api.get(`/deductions/camp/${campId}/sheet`, { params: { year, month } }),
  updateInstallment: (id: string, data: unknown) => api.patch(`/deductions/${id}`, data),
  bulkSubmit:        (data: unknown) => api.post('/deductions/bulk-submit', data),
  monthlySummary:    () => api.get('/deductions/summary/monthly'),
};

export const legacyApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/legacy-import/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000, // 2 min for large files
    });
  },
  // PDF files are stored as reference only — NOT parsed for import.
  // Structured import data always comes from Excel/CSV.
  attachPdf: (batchId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/legacy-import/${batchId}/attach-pdf`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getBatch:   (id: string) => api.get(`/legacy-import/${id}`),
  saveMapping:(id: string, data: unknown) => api.post(`/legacy-import/${id}/mapping`, data),
  preview:    (id: string, limit = 30) => api.get(`/legacy-import/${id}/preview`, { params: { limit } }),
  runImport:  (id: string) => api.post(`/legacy-import/${id}/import`, null, { timeout: 300_000 }), // 5 min
  list:       () => api.get('/legacy-import'),
  getRows:    (id: string, params: Record<string, unknown>) => api.get(`/legacy-import/${id}/rows`, { params }),
  linkCustomer:(rowId: string, customerId: string) =>
    api.post(`/legacy-import/rows/${rowId}/link-customer`, { customer_id: customerId }),
};

export const reportsApi = {
  download: (path: string, params: Record<string, unknown> = {}) =>
    api.get(path, { params, responseType: 'blob' }),
};

export const chequeApi = {
  // Bank templates
  listBanks:     () => api.get('/cheque/banks'),
  createBank:    (data: unknown) => api.post('/cheque/banks', data),
  updateBank:    (id: string, data: unknown) => api.put(`/cheque/banks/${id}`, data),
  deleteBank:    (id: string) => api.delete(`/cheque/banks/${id}`),

  // Print history
  listHistory:   (params?: Record<string, unknown>) => api.get('/cheque/history', { params }),
  recordPrint:   (data: unknown) => api.post('/cheque/history', data),
  deleteHistory: (id: string) => api.delete(`/cheque/history/${id}`),
  clearHistory:  () => api.delete('/cheque/history'),
};

export const payrollApi = {
  listRuns:       (params: Record<string, unknown> = {}) => api.get('/payroll/runs', { params }),
  getRun:         (id: string) => api.get(`/payroll/runs/${id}`),
  createRun:      (data: unknown) => api.post('/payroll/runs', data),
  approveRun:     (id: string) => api.post(`/payroll/runs/${id}/approve`),
  markPaidRun:    (id: string) => api.post(`/payroll/runs/${id}/mark-paid`),
  listStaff:      () => api.get('/payroll/staff'),
  listUsers:      () => api.get('/payroll/staff/users'),
  createStaff:    (data: unknown) => api.post('/payroll/staff', data),
  updateStaff:    (id: string, data: unknown) => api.put(`/payroll/staff/${id}`, data),
};

export const documentsApi = {
  list: (customerId: string) =>
    api.get(`/customers/${customerId}/documents`),
  upload: (customerId: string, documentType: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('document_type', documentType);
    return api.post(`/customers/${customerId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  verify: (customerId: string, docId: string, status: 'verified' | 'rejected', rejectionReason?: string) =>
    api.post(`/customers/${customerId}/documents/${docId}/verify`, {
      status,
      rejection_reason: rejectionReason,
    }),
};

export const tasksApi = {
  list:   () => api.get('/tasks'),
  create: (data: unknown) => api.post('/tasks', data),
  update: (id: string, data: unknown) => api.patch(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

