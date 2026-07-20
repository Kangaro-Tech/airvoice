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
    CREATE TABLE IF NOT EXISTS public.districts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      name_si TEXT,
      name_ta TEXT,
      province TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_districts_name ON public.districts(name);
    CREATE INDEX IF NOT EXISTS idx_districts_province ON public.districts(province);
  `;

  try {
    await runSql(sql);
    console.log('Districts table created or already exists.');
  } catch (error) {
    console.error('Failed to create districts table:', (error as any).message || error);
    if (!DATABASE_URL) {
      console.error('Hint: set DATABASE_URL in .env to a Postgres connection string, or create a public.exec_sql stored procedure in your database.');
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
