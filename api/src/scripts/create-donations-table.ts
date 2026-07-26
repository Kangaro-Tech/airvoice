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
    CREATE TABLE IF NOT EXISTS public.donations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        completed_paid_phone_count INTEGER NOT NULL,
        percentage NUMERIC NOT NULL DEFAULT 3.0,
        chq_no VARCHAR(255),
        chq_amount NUMERIC(10, 2),
        delivery VARCHAR(50) CHECK (delivery IN ('POST', 'COURIER', 'OFFICE_COLLECT', 'CAMP_HAND_OVER')),
        sending_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  try {
    await runSql(sql);
    console.log('Donations table created or already exists.');
  } catch (error) {
    console.error('Failed to create donations table:', (error as any).message || error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
