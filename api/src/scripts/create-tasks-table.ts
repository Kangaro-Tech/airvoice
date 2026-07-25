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
    CREATE TABLE IF NOT EXISTS public.task_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      text TEXT NOT NULL,
      deadline BIGINT NOT NULL,
      notified BOOLEAN NOT NULL DEFAULT false,
      archived BOOLEAN NOT NULL DEFAULT false,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_task_notes_deadline ON public.task_notes(deadline);
    CREATE INDEX IF NOT EXISTS idx_task_notes_user_id ON public.task_notes(user_id);
  `;

  try {
    await runSql(sql);
    console.log('Task Notes table created or already exists.');
  } catch (error) {
    console.error('Failed to create task notes table:', (error as any).message || error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
