import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import SplashScreen from '@/components/SplashScreen';

// Layouts
import AppLayout from '@/components/layout/AppLayout';
import AuthLayout from '@/components/layout/AuthLayout';

// Pages — Auth
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';

// Pages — Core
import DashboardPage from '@/pages/DashboardPage';
import NotificationsPage from '@/pages/NotificationsPage';
import MyProfilePage from '@/pages/MyProfilePage';

// Pages — Customers
import CustomersPage from '@/pages/customers/CustomersPage';
import CustomerProfilePage from '@/pages/customers/CustomerProfilePage';
import CreateCustomerPage from '@/pages/customers/CreateCustomerPage';

// Pages — Applications
import ApplicationsPage from '@/pages/applications/ApplicationsPage';
import ApplicationDetailPage from '@/pages/applications/ApplicationDetailPage';

// Pages — Operations
import CampPortalPage from '@/pages/camps/CampPortalPage';
import InventoryPage from '@/pages/inventory/InventoryPage';
import PhonesPage from '@/pages/inventory/PhonesPage';

// Pages — Finance
import FinancePage from '@/pages/finance/FinancePage';
import ExpensesPage from '@/pages/finance/ExpensesPage';
import PayrollPage from '@/pages/finance/PayrollPage';
import StaffProfilePage from '@/pages/payroll/StaffProfilePage';
import InstallmentsPage from '@/pages/finance/InstallmentsPage';
import PettyCashPage from '@/pages/finance/PettyCashPage';
import CompanyPaymentsPage from '@/pages/finance/CompanyPaymentsPage';
import DonationsPage from '@/pages/finance/DonationsPage';

// Pages — HR & Payroll (System Operator)
import StaffDirectoryPage from '@/pages/hr/StaffDirectoryPage';
import AttendanceManagementPage from '@/pages/hr/AttendanceManagementPage';
import LeaveManagementPage from '@/pages/hr/LeaveManagementPage';
import PayrollManagementPage from '@/pages/hr/PayrollManagementPage';

// Pages — Recovery & Sales
import RecoveryPage from '@/pages/recovery/RecoveryPage';
import GuarantorsPage from '@/pages/recovery/GuarantorsPage';
import SalesOfficerPage from '@/pages/sales/SalesOfficerPage';

// Pages — Legacy
import LegacyImportPage from '@/pages/legacy/LegacyImportPage';
import LegacyUploadPage from '@/pages/legacy/LegacyUploadPage';
import LegacyMappingPage from '@/pages/legacy/LegacyMappingPage';
import LegacyPreviewPage from '@/pages/legacy/LegacyPreviewPage';

// Pages — Admin
import AdminPage from '@/pages/admin/AdminPage';
import AuditLogsPage from '@/pages/admin/AuditLogsPage';
import UsersPage from '@/pages/admin/UsersPage';
import CampManagementPage from '@/pages/admin/CampManagementPage';
import SettingsPage from '@/pages/admin/SettingsPage';
import AIRiskPage from '@/pages/admin/AIRiskPage';
import CustomerAppPage from '@/pages/admin/CustomerAppPage';

// Pages — Reports
import ReportsPage from '@/pages/ReportsPage';
import SchedulePage from '@/pages/SchedulePage';

// Pages — Tools
import ChequePrinterPage from '@/pages/cheque/ChequePrinterPage';
import StockOrdersPage from '@/pages/inventory/StockOrdersPage';

// Auth guard
import ProtectedRoute from '@/components/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: unknown) => {
        if ((error as { status?: number })?.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  return (
    <>
      {!splashDone && <SplashScreen onFinish={handleSplashFinish} />}
      <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          {/* Protected — all staff */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/profile" element={<MyProfilePage />} />

              {/* Customers */}
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/new" element={<CreateCustomerPage />} />
              <Route path="/customers/:id" element={<CustomerProfilePage />} />

              {/* Applications */}
              <Route path="/applications" element={<ApplicationsPage />} />
              <Route path="/applications/:id" element={<ApplicationDetailPage />} />

              <Route path="/schedule" element={<SchedulePage />} />

              {/* Operations */}
              <Route path="/camp" element={<CampPortalPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/stock-orders" element={<StockOrdersPage />} />
              <Route path="/phones" element={<PhonesPage />} />
              <Route path="/cheque" element={<ChequePrinterPage />} />
              <Route path="/guarantors" element={<GuarantorsPage />} />

              {/* Recovery (recovery_officer + finance + admin) */}
              <Route element={<ProtectedRoute roles={['recovery_officer', 'finance_officer', 'accountant', 'admin', 'super_admin']} />}>
                <Route path="/recovery" element={<RecoveryPage />} />
              </Route>

              {/* Finance (Strict) */}
              <Route element={<ProtectedRoute roles={['finance_officer', 'accountant', 'admin', 'super_admin']} />}>
                <Route path="/finance" element={<FinancePage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/payroll" element={<PayrollPage />} />
                <Route path="/payroll/staff/:id" element={<StaffProfilePage />} />
                <Route path="/legacy-import" element={<LegacyImportPage />} />
                <Route path="/legacy-import/upload" element={<LegacyUploadPage />} />
                <Route path="/legacy-import/:id/mapping" element={<LegacyMappingPage />} />
                <Route path="/legacy-import/:id/preview" element={<LegacyPreviewPage />} />
                <Route path="/petty-cash" element={<PettyCashPage />} />
                <Route path="/company-payments" element={<CompanyPaymentsPage />} />
              </Route>

              {/* HR & Payroll + Audit Log */}
              <Route element={<ProtectedRoute roles={['finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator']} />}>
                <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={['admin', 'super_admin', 'system_operator']} />}>
                <Route path="/hr/staff" element={<StaffDirectoryPage />} />
                <Route path="/hr/attendance" element={<AttendanceManagementPage />} />
                <Route path="/hr/leaves" element={<LeaveManagementPage />} />
                <Route path="/hr/advances" element={<PayrollManagementPage />} />
                <Route path="/hr/deductions" element={<PayrollManagementPage />} />
              </Route>

              {/* Installments & Reports (Finance + Camp Officer) */}
              <Route element={<ProtectedRoute roles={['finance_officer', 'accountant', 'camp_officer', 'admin', 'super_admin']} />}>
                <Route path="/installments" element={<InstallmentsPage />} />
                <Route path="/donations" element={<DonationsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Route>

              {/* Sales (sales_officer + admin) */}
              <Route element={<ProtectedRoute roles={['sales_officer', 'finance_officer', 'admin', 'super_admin']} />}>
                <Route path="/sales" element={<SalesOfficerPage />} />
              </Route>

              {/* Admin+ */}
              <Route element={<ProtectedRoute roles={['admin', 'super_admin']} />}>
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/users" element={<UsersPage />} />
                <Route path="/admin/ai-risk" element={<AIRiskPage />} />
                <Route path="/admin/customer-app" element={<CustomerAppPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              {/* Super admin only */}
              <Route element={<ProtectedRoute roles={['super_admin']} />}>
                <Route path="/admin/camps" element={<CampManagementPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </QueryClientProvider>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
