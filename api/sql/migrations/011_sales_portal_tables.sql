-- (a) Per-officer monthly expense limit (management sets)
CREATE TABLE IF NOT EXISTS public.officer_expense_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  limit_month date NOT NULL,                         -- first day of the month
  monthly_limit numeric(12,2) NOT NULL CHECK (monthly_limit >= 0),
  set_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (officer_id, limit_month)
);

-- (b) Monthly phone-sale target per officer (admin sets)
CREATE TABLE IF NOT EXISTS public.sales_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_month date NOT NULL,
  target_phones int NOT NULL CHECK (target_phones >= 0),
  target_amount numeric(12,2),
  notes text,
  set_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (officer_id, target_month)
);

-- (c) Daily stock assigned to a sales officer
CREATE TABLE IF NOT EXISTS public.officer_stock_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  model_id uuid REFERENCES public.phone_models(id) ON DELETE SET NULL,
  phone_id uuid REFERENCES public.phones(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  assign_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'assigned',           -- assigned | sold | returned
  assigned_by uuid REFERENCES public.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osa_officer_date
  ON public.officer_stock_assignments(officer_id, assign_date);
