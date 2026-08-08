-- Sales Member Aliases & Commission Split (125 + 125)
-- Supports company workers paired with field salesmen
-- Field salesmen (Sales Officers) get 250 total (125+125)

CREATE TABLE IF NOT EXISTS public.sales_member_aliases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alias text NOT NULL UNIQUE,                       -- e.g. "CHANDULA", "WEERASEKARA"
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  designation text,                                  -- staff designation if available
  is_company_worker boolean DEFAULT false,           -- true for company workers, false for sales officers
  split_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,  -- paired field salesman's user_id
  worker_amount numeric(12,2) DEFAULT 125.00,       -- commission to the SALES MEMBER if company worker
  split_amount numeric(12,2) DEFAULT 125.00,        -- commission to the split_user_id (field salesman)
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_sales_member_aliases_user
  ON public.sales_member_aliases(user_id);

CREATE INDEX IF NOT EXISTS idx_sales_member_aliases_split
  ON public.sales_member_aliases(split_user_id);

COMMENT ON TABLE public.sales_member_aliases IS 'Sales member to user mapping with commission split configuration';
COMMENT ON COLUMN public.sales_member_aliases.is_company_worker IS 'True if this person is a company worker (not a Sales Officer)';
COMMENT ON COLUMN public.sales_member_aliases.split_user_id IS 'User ID of the paired field salesman (for company workers)';
