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
      localStorage.setItem('av_token', token);
    } catch { /* use cached token */ }
  } else {
    const token = getActiveToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      localStorage.setItem('av_token', token);
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
  list: (params: Record<string, unknown>) => api.get('/customers', { params }),
  get: (id: string) => api.get(`/customers/${id}`),
  create: (data: unknown) => api.post('/customers', data),
  update: (id: string, data: unknown) => api.patch(`/customers/${id}`, data),
  checkDuplicate: (data: unknown) => api.post('/customers/check-duplicate', data),
  checkEligibility: (id: string) => api.get(`/customers/${id}/phone-eligibility`),
  refreshRisk: (id: string) => api.post(`/customers/${id}/refresh-risk`),
};

export const applicationsApi = {
  list: (params: Record<string, unknown>) => api.get('/applications', { params }),
  get: (id: string) => api.get(`/applications/${id}`),
  create: (data: unknown) => api.post('/applications', data),
  submit: (id: string) => api.post(`/applications/${id}/submit`),
  salesReview: (id: string, data: unknown) => api.post(`/applications/${id}/sales-review`, data),
  campReview: (id: string, data: unknown) => api.post(`/applications/${id}/camp-review`, data),
  financeReview: (id: string, data: unknown) => api.post(`/applications/${id}/finance-review`, data),
  handover: (id: string, data: unknown) => api.post(`/applications/${id}/handover`, data),
  specialApproval: (id: string, data: unknown) => api.post(`/applications/${id}/special-approval`, data),
};

export const deductionsApi = {
  getCampSheet: (campId: string, year: number, month: number) =>
    api.get(`/deductions/camp/${campId}/sheet`, { params: { year, month } }),
  updateInstallment: (id: string, data: unknown) => api.patch(`/deductions/${id}`, data),
  bulkSubmit: (data: unknown) => api.post('/deductions/bulk-submit', data),
  monthlySummary: () => api.get('/deductions/summary/monthly'),
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
  getBatch: (id: string) => api.get(`/legacy-import/${id}`),
  saveMapping: (id: string, data: unknown) => api.post(`/legacy-import/${id}/mapping`, data),
  preview: (id: string, limit = 30) => api.get(`/legacy-import/${id}/preview`, { params: { limit } }),
  runImport: (id: string) => api.post(`/legacy-import/${id}/import`, null, { timeout: 300_000 }), // 5 min
  list: () => api.get('/legacy-import'),
  getRows: (id: string, params: Record<string, unknown>) => api.get(`/legacy-import/${id}/rows`, { params }),
  linkCustomer: (rowId: string, customerId: string) =>
    api.post(`/legacy-import/rows/${rowId}/link-customer`, { customer_id: customerId }),
};

export const reportsApi = {
  download: (path: string, params: Record<string, unknown> = {}) =>
    api.get(path, { params, responseType: 'blob' }),
};

export const chequeApi = {
  // Bank templates
  listBanks: () => api.get('/cheque/banks'),
  createBank: (data: unknown) => api.post('/cheque/banks', data),
  updateBank: (id: string, data: unknown) => api.put(`/cheque/banks/${id}`, data),
  deleteBank: (id: string) => api.delete(`/cheque/banks/${id}`),

  // Print history
  listHistory: (params?: Record<string, unknown>) => api.get('/cheque/history', { params }),
  recordPrint: (data: unknown) => api.post('/cheque/history', data),
  deleteHistory: (id: string) => api.delete(`/cheque/history/${id}`),
  clearHistory: () => api.delete('/cheque/history'),
};

export const payrollApi = {
  listRuns: (params: Record<string, unknown> = {}) => api.get('/payroll/runs', { params }),
  getRun: (id: string) => api.get(`/payroll/runs/${id}`),
  createRun: (data: unknown) => api.post('/payroll/runs', data),
  approveRun: (id: string) => api.post(`/payroll/runs/${id}/approve`),
  markPaidRun: (id: string) => api.post(`/payroll/runs/${id}/mark-paid`),
  listStaff: () => api.get('/payroll/staff'),
  listUsers: () => api.get('/payroll/staff/users'),
  getStaff: (id: string) => api.get(`/payroll/staff/${id}`),
  createStaff: (data: unknown) => api.post('/payroll/staff', data),
  updateStaff: (id: string, data: unknown) => api.put(`/payroll/staff/${id}`, data),
  uploadStaffPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/payroll/staff/${id}/upload-photo`, form);
  },
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

export const authApi = {
  loginWithPhone: (token: string) => api.post('/auth/register', { firebase_id_token: token }),
  requestOtp: (phone_number: string) => api.post('/auth/otp-request', { phone_number }),
  verifyOtp: (phone: string, otp: string) => api.post('/auth/otp-verify', { phone, otp }),
  getMe: () => api.get('/auth/me'),
  uploadMePhoto: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/auth/me/photo', form);
  }
};

export const tasksApi = {
  list: () => api.get('/tasks'),
  create: (data: unknown) => api.post('/tasks', data),
  update: (id: string, data: unknown) => api.patch(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

export const donationsApi = {
  list: () => api.get('/donations'),
  create: (data: unknown) => api.post('/donations', data),
  update: (id: string, data: unknown) => api.put(`/donations/${id}`, data),
  delete: (id: string) => api.delete(`/donations/${id}`),
};

export const hrApi = {
  // Attendance
  markAttendance: (data: unknown) => api.post('/hr/attendance/mark', data),
  listAttendance: (params?: Record<string, unknown>) => api.get('/hr/attendance/list', { params }),
  // Leaves
  requestLeave: (data: unknown) => api.post('/hr/leaves/request', data),
  createLeaveBalance: (data: unknown) => api.post('/hr/leaves/balances', data),
  listLeaveBalances: (params?: Record<string, unknown>) => api.get('/hr/leaves/balances', { params }),
  updateLeaveBalance: (id: string, data: unknown) => api.put(`/hr/leaves/balances/${id}`, data),
  listLeaveRequests: (params?: Record<string, unknown>) => api.get('/hr/leaves/requests', { params }),
  updateLeaveRequestStatus: (id: string, data: { status: string }) => api.put(`/hr/leaves/requests/${id}/status`, data),
  // Advances
  createAdvance: (data: unknown) => api.post('/hr/payroll/advance', data),
  listSalaryAdvances: (params?: Record<string, unknown>) => api.get('/hr/payroll/advances', { params }),
  updateSalaryAdvanceStatus: (id: string, data: { status: string }) => api.put(`/hr/payroll/advances/${id}/status`, data),
  // Deductions
  listSalaryDeductions: () => api.get('/hr/payroll/deductions'),
  updateDeductionStatus: (id: string, data: { status: string }) => api.put(`/hr/payroll/deductions/${id}/status`, data),
  createDeduction: (data: unknown) => api.post('/hr/payroll/deduction', data),
  // Audit logs
  listAuditLogs: (params?: Record<string, unknown>) => api.get('/hr/audit-logs', { params }),
};
