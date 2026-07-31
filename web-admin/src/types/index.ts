// ── Shared types for AIRVOICE web-admin ──────────────────────

export type UserRole =
  | 'customer' | 'guarantor' | 'sales_officer' | 'camp_officer'
  | 'finance_officer' | 'recovery_officer' | 'inventory_manager'
  | 'accountant' | 'admin' | 'super_admin' | 'system_operator';

export type Branch = 'army' | 'navy' | 'air_force';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ApplicationStatus =
  | 'draft' | 'submitted' | 'sales_review' | 'camp_review'
  | 'finance_review' | 'admin_review' | 'approved' | 'active'
  | 'completed' | 'rejected' | 'cancelled';

export interface Customer {
  id: string;
  full_name: string;
  nic_number: string | null;
  service_number: string | null;
  military_id_number: string | null;
  branch: Branch;
  rank: string;
  phone_number: string | null;
  email: string | null;
  retirement_date: string | null;
  risk_level: RiskLevel;
  risk_score: number;
  is_active: boolean;
  is_blocked: boolean;
  has_app_account: boolean;
  document_verification_status: string;
  camp: { id: string; name: string; branch: Branch } | null;
}

export interface Application {
  id: string;
  ref_number: string;
  status: ApplicationStatus;
  sale_price: number;
  down_payment: number;
  monthly_amount: number;
  term_months: number;
  plan_end_date: string | null;
  created_at: string;
  customer: Customer | null;
  phone_model: { brand: string; model: string; storage: string } | null;
}

export interface LegacyBatch {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  total_rows: number | null;
  imported_rows: number | null;
  duplicate_rows: number | null;
  invalid_rows: number | null;
  column_mapping: Record<string, string> | null;
  sheet_regiment: string | null;
  pdf_reference_path: string | null;
  created_at: string;
}

export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: ApiMeta;
}

export interface Attendance {
  id: string;
  staff_id: string;
  date: string;
  in_time: string | null;
  out_time: string | null;
  status: string;
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  staff_id: string;
  year: number;
  leave_type: string;
  allotted_days: number;
  used_days: number;
}

export interface LeaveRequest {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  created_at: string;
}

export interface SalaryAdvance {
  id: string;
  staff_id: string;
  amount: number;
  request_date: string;
  deduction_month: string;
  status: 'pending' | 'approved' | 'rejected' | 'deducted';
  approved_by: string | null;
  created_at: string;
}

export interface SalaryDeduction {
  id: string;
  staff_id: string;
  deduction_type: 'loan' | 'epf' | 'etf' | 'other';
  amount: number;
  effective_date: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface TaskDelegation {
  id: string;
  delegator_id: string;
  assignee_id: string;
  module_name: string;
  created_at: string;
}
