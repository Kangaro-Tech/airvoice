// ── Shared types for AIRVOICE web-admin ──────────────────────

export type UserRole =
  | 'customer' | 'guarantor' | 'sales_officer' | 'camp_officer'
  | 'finance_officer' | 'recovery_officer' | 'inventory_manager'
  | 'accountant' | 'admin' | 'super_admin';

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
