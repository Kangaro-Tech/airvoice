-- ============================================================
-- 006: Recovery Letters Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recovery_letters (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id     uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id  uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  letter_type     text NOT NULL DEFAULT 'first_notice' CHECK (letter_type IN ('first_notice', 'second_notice', 'final_notice', 'legal_notice')),
  letter_body     text NOT NULL,
  sent_at         timestamptz,
  sent_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  delivery_method text CHECK (delivery_method IN ('email', 'whatsapp', 'post', 'in_person')),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'delivered', 'failed')),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_letters_customer ON public.recovery_letters(customer_id);
CREATE INDEX IF NOT EXISTS idx_recovery_letters_status ON public.recovery_letters(status);
