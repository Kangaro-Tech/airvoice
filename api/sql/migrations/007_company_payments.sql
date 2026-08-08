-- ============================================================
-- 005: Company Payments (AirVoice Advance Payments) Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_payments (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id         uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id      uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  installment_id      uuid REFERENCES public.installments(id) ON DELETE SET NULL,
  amount              numeric(12,2) NOT NULL CHECK (amount > 0),
  recovered_amount    numeric(12,2) DEFAULT 0 CHECK (recovered_amount >= 0),
  status              text NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'partially_recovered', 'fully_recovered')),
  paid_at             timestamptz DEFAULT now(),
  notes               text,
  processed_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_payments_customer ON public.company_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_company_payments_status ON public.company_payments(status);
