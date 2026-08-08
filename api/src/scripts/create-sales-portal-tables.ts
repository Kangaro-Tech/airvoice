import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

async function runSql(sql: string) {
  if (DATABASE_URL) {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
    return;
  }

  if (!supabase) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATABASE_URL is not configured.');
  }

  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    throw error;
  }
}

async function main() {
  const sql = `
CREATE TABLE IF NOT EXISTS public.officer_expense_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  limit_month date NOT NULL,
  monthly_limit numeric(12,2) NOT NULL CHECK (monthly_limit >= 0),
  set_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (officer_id, limit_month)
);

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

CREATE TABLE IF NOT EXISTS public.officer_stock_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  model_id uuid REFERENCES public.phone_models(id) ON DELETE SET NULL,
  phone_id uuid REFERENCES public.phones(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  assign_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'assigned',
  assigned_by uuid REFERENCES public.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osa_officer_date
  ON public.officer_stock_assignments(officer_id, assign_date);
  `;

  try {
    await runSql(sql);
    console.log('Sales portal gap tables created successfully.');
  } catch (error) {
    console.error('Failed to create sales portal tables:', (error as any).message || error);
  }
}

main().catch((err) => {
  console.error(err);
});
