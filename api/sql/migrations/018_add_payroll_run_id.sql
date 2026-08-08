-- Migration 014: Add payroll_run_id to commissions for idempotent payroll processing
-- Ensures commissions are paid only once per payroll run

ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL;

-- Create index for fast lookups during payroll runs
CREATE INDEX IF NOT EXISTS idx_commissions_payroll_run_id ON commissions(payroll_run_id) 
WHERE payroll_run_id IS NOT NULL;

-- Create composite index for payroll run queries
CREATE INDEX IF NOT EXISTS idx_commissions_status_payroll_run ON commissions(status, payroll_run_id) 
WHERE status IN ('payable', 'paid');

COMMIT;
