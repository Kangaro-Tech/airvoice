-- ============================================================
-- 004: Guarantor Payments Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.guarantor_payments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id     uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id  uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  guarantor_id    uuid REFERENCES public.guarantors(id) ON DELETE SET NULL,
  installment_id  uuid REFERENCES public.installments(id) ON DELETE SET NULL,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at         timestamptz DEFAULT now(),
  notes           text,
  processed_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guarantor_payments_customer ON public.guarantor_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_guarantor_payments_application ON public.guarantor_payments(application_id);
