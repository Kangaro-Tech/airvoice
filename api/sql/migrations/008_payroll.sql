-- Payroll & Staff Registry tables

CREATE TABLE IF NOT EXISTS public.staff_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    nic_number TEXT,
    phone_number TEXT,
    email TEXT,
    designation TEXT NOT NULL,
    department TEXT,
    basic_salary NUMERIC(12,2) DEFAULT 0,
    transport_allow NUMERIC(12,2) DEFAULT 0,
    meal_allow NUMERIC(12,2) DEFAULT 0,
    commission_rate NUMERIC(5,2) DEFAULT 0,
    epf_no TEXT,
    etf_no TEXT,
    joined_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_month TEXT NOT NULL, -- e.g. "2024-05"
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
    notes TEXT,
    total_gross NUMERIC(12,2) DEFAULT 0,
    total_net NUMERIC(12,2) DEFAULT 0,
    total_epf_ee NUMERIC(12,2) DEFAULT 0,
    total_epf_er NUMERIC(12,2) DEFAULT 0,
    total_etf NUMERIC(12,2) DEFAULT 0,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.staff_registry(id) ON DELETE RESTRICT,
    basic_salary NUMERIC(12,2) DEFAULT 0,
    transport_allow NUMERIC(12,2) DEFAULT 0,
    meal_allow NUMERIC(12,2) DEFAULT 0,
    commission_amount NUMERIC(12,2) DEFAULT 0,
    phones_sold INTEGER DEFAULT 0,
    epf_ee NUMERIC(12,2) DEFAULT 0,
    epf_er NUMERIC(12,2) DEFAULT 0,
    etf NUMERIC(12,2) DEFAULT 0,
    gross_salary NUMERIC(12,2) DEFAULT 0,
    net_salary NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
