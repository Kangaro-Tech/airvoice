import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);

const sql = `
CREATE TABLE IF NOT EXISTS public.guarantor_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id),
  customer_id UUID REFERENCES public.customers(id),
  guarantor_id UUID REFERENCES public.customers(id),
  reason TEXT,
  draft_letter TEXT,
  status TEXT DEFAULT 'pending',
  requested_by UUID REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

supabase.rpc('exec_sql', { sql }).then(r => console.log(r.error ? r.error.message : 'Table created'));
