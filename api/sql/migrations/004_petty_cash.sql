-- ============================================================
-- 003: Petty Cash Entries Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.petty_cash_entries (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date      date NOT NULL,
  description     text NOT NULL,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  type            text NOT NULL CHECK (type IN ('credit', 'debit')),
  category        text,
  reference_number text,
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_date ON public.petty_cash_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_petty_cash_created_by ON public.petty_cash_entries(created_by);
