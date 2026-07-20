-- ============================================================
-- AIRVOICE Expenses Migration
-- Run this ONCE in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- 1. Add missing columns to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'Cash';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_reference text;

-- 2. Create expense_budgets table
CREATE TABLE IF NOT EXISTS expense_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  budget_month date NOT NULL,
  budgeted_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, budget_month)
);

-- 3. Enable RLS on expense_budgets
ALTER TABLE expense_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view budgets" ON expense_budgets FOR SELECT USING (true);
CREATE POLICY "Finance can manage budgets" ON expense_budgets FOR ALL USING (true);

-- 4. Insert budget data for June 2025
-- (category IDs match what was seeded by run-seed.ts)
INSERT INTO expense_budgets (id, category_id, budget_month, budgeted_amount)
VALUES
  ('b0110000-0000-0000-0000-000000000001', 'c0110000-0000-0000-0000-000000000001', '2025-06-01', 30000),
  ('b0110000-0000-0000-0000-000000000002', 'c0110000-0000-0000-0000-000000000002', '2025-06-01', 60000),
  ('b0110000-0000-0000-0000-000000000003', 'c0110000-0000-0000-0000-000000000003', '2025-06-01', 200000),
  ('b0110000-0000-0000-0000-000000000004', 'c0110000-0000-0000-0000-000000000004', '2025-06-01', 15000),
  ('b0110000-0000-0000-0000-000000000005', 'c0110000-0000-0000-0000-000000000005', '2025-06-01', 700000),
  ('b0110000-0000-0000-0000-000000000006', 'c0110000-0000-0000-0000-000000000006', '2025-06-01', 10000)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert staff users (using unique phone numbers)
-- Note: These users are needed for the expense submissions
INSERT INTO users (id, firebase_uid, phone_number, role, is_active, is_verified)
VALUES
  ('aaaa0001-0000-0000-0000-000000000101', 'dev-nimal-uid',       '+94760000101', 'sales_officer',   true, true),
  ('aaaa0001-0000-0000-0000-000000000102', 'dev-kamal-uid',       '+94760000102', 'sales_officer',   true, true),
  ('aaaa0001-0000-0000-0000-000000000103', 'dev-lasith-uid',      '+94760000103', 'sales_officer',   true, true),
  ('aaaa0001-0000-0000-0000-000000000104', 'dev-admin-off-uid',   '+94760000104', 'admin',           true, true),
  ('aaaa0001-0000-0000-0000-000000000105', 'dev-finance-off-uid', '+94760000105', 'finance_officer', true, true)
ON CONFLICT (id) DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid;

-- 6. Insert staff registry records
INSERT INTO staff_registry (id, user_id, full_name, designation)
VALUES
  ('eeee0001-0000-0000-0000-000000000001', 'aaaa0001-0000-0000-0000-000000000101', 'Nimal Silva',      'Sales Officer'),
  ('eeee0001-0000-0000-0000-000000000002', 'aaaa0001-0000-0000-0000-000000000102', 'Kamal Jayawardena','Sales Officer'),
  ('eeee0001-0000-0000-0000-000000000003', 'aaaa0001-0000-0000-0000-000000000103', 'Lasith Mendis',    'Sales Officer'),
  ('eeee0001-0000-0000-0000-000000000004', 'aaaa0001-0000-0000-0000-000000000104', 'Office Admin',     'Administrator'),
  ('eeee0001-0000-0000-0000-000000000005', 'aaaa0001-0000-0000-0000-000000000105', 'Finance',          'Finance Manager')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, designation = EXCLUDED.designation;

-- 7. Insert expense ledger entries
INSERT INTO expenses (id, category_id, amount, description, expense_date, submitted_by, status, payment_method, receipt_reference, is_suspicious, flagged_reason)
VALUES
  ('e0110000-0000-0000-0000-000000000001', 'c0110000-0000-0000-0000-000000000001', 12500,  'Sales officer fuel — Nimal Silva Jun W1',       '2025-06-07', 'aaaa0001-0000-0000-0000-000000000101', 'approved', 'Cash',          'REF-FUEL-001',   false, null),
  ('e0110000-0000-0000-0000-000000000002', 'c0110000-0000-0000-0000-000000000002', 45000,  'Printer cartridges and stationery',             '2025-06-10', 'aaaa0001-0000-0000-0000-000000000104', 'approved', 'Card',          'REF-OFFICE-002', false, null),
  ('e0110000-0000-0000-0000-000000000003', 'c0110000-0000-0000-0000-000000000001', 28000,  'Sales officer fuel — Kamal Jayawardena Jun',    '2025-06-12', 'aaaa0001-0000-0000-0000-000000000102', 'pending',  'Cash',          'REF-FUEL-003',   true,  '240% above personal monthly average (avg LKR 8,200)'),
  ('e0110000-0000-0000-0000-000000000004', 'c0110000-0000-0000-0000-000000000006', 5500,   'Team lunch — client visit Panagoda Camp',       '2025-06-14', 'aaaa0001-0000-0000-0000-000000000103', 'approved', 'Cash',          null,             false, null),
  ('e0110000-0000-0000-0000-000000000005', 'c0110000-0000-0000-0000-000000000003', 185000, 'Staff salary — June 2025',                      '2025-06-25', 'aaaa0001-0000-0000-0000-000000000105', 'approved', 'Bank Transfer', 'REF-SAL-005',    false, null),
  ('e0110000-0000-0000-0000-000000000006', 'c0110000-0000-0000-0000-000000000005', 620000, 'Import batch 2025-06 — 10x AIRVOICE Model X7', '2025-06-18', 'aaaa0001-0000-0000-0000-000000000105', 'approved', 'Bank Transfer', 'REF-IMP-006',    false, null),
  ('e0110000-0000-0000-0000-000000000007', 'c0110000-0000-0000-0000-000000000004', 11000,  'Sales commissions paid — May 2025 (44 units)', '2025-06-01', 'aaaa0001-0000-0000-0000-000000000105', 'approved', 'Bank Transfer', 'REF-COMM-007',   false, null)
ON CONFLICT (id) DO UPDATE SET
  description    = EXCLUDED.description,
  amount         = EXCLUDED.amount,
  status         = EXCLUDED.status,
  payment_method = EXCLUDED.payment_method,
  is_suspicious  = EXCLUDED.is_suspicious,
  flagged_reason = EXCLUDED.flagged_reason;

-- Done!
SELECT 'Migration complete! ✅' as result;
