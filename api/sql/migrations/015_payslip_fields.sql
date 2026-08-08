-- Add new allowances to staff_registry
ALTER TABLE public.staff_registry ADD COLUMN IF NOT EXISTS attendance_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.staff_registry ADD COLUMN IF NOT EXISTS performance_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.staff_registry ADD COLUMN IF NOT EXISTS allowance_01 NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.staff_registry ADD COLUMN IF NOT EXISTS allowance_02 NUMERIC(12,2) DEFAULT 0;

-- Add new fields to payroll_lines
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS attendance_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS performance_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS allowance_01 NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS allowance_02 NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS no_pay_deduction NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS working_days NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS leave_days NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS no_pay_days NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS loans NUMERIC(12,2) DEFAULT 0;
