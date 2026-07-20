import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.special_approval_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL REFERENCES public.customers(id),
      phone_model_id UUID NOT NULL REFERENCES public.phone_models(id),
      term_months INTEGER NOT NULL CHECK (term_months BETWEEN 1 AND 60),
      requested_by UUID NOT NULL REFERENCES public.users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by UUID REFERENCES public.users(id),
      reviewed_at TIMESTAMPTZ,
      review_note TEXT,
      application_id UUID REFERENCES public.applications(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_special_approval_requests_status
      ON public.special_approval_requests(status);

    CREATE INDEX IF NOT EXISTS idx_special_approval_requests_customer
      ON public.special_approval_requests(customer_id);

    CREATE INDEX IF NOT EXISTS idx_special_approval_requests_requested_by
      ON public.special_approval_requests(requested_by);
  `;

  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error('RPC exec failed:', error);
    process.exit(1);
  }

  console.log('special_approval_requests table created or already exists.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
