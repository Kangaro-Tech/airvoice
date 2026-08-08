-- Add deductions column to payroll_lines to track loans and salary advances

ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS deductions NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.payroll_lines ADD COLUMN IF NOT EXISTS bonus NUMERIC(12,2) DEFAULT 0;
