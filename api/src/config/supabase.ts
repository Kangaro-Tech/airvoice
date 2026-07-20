import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

let supabaseClient: SupabaseClient<any> | null = null;

function createMissingSupabaseClient(): SupabaseClient<any> {
  const buildQuery = () => ({
    select: () => buildQuery(),
    insert: () => buildQuery(),
    update: () => buildQuery(),
    delete: () => buildQuery(),
    upsert: () => buildQuery(),
    eq: () => buildQuery(),
    order: () => buildQuery(),
    limit: () => buildQuery(),
    range: () => buildQuery(),
    single: async () => ({ data: null, error: new Error('Supabase is not configured') }),
    maybeSingle: async () => ({ data: null, error: new Error('Supabase is not configured') }),
  });

  return {
    from: () => buildQuery(),
    rpc: async () => ({ data: null, error: new Error('Supabase is not configured') }),
  } as unknown as SupabaseClient<any>;
}

export function initSupabase(): SupabaseClient<any> {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role bypasses RLS

  if (!url || !key) {
    console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — using a safe fallback client.');
    supabaseClient = createMissingSupabaseClient();
    return supabaseClient;
  }

  supabaseClient = createClient<any>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

export function getSupabase(): SupabaseClient<any> {
  if (!supabaseClient) {
    return initSupabase();
  }
  return supabaseClient;
}

/**
 * Helper: run a Supabase query and throw on error.
 */
export async function query<T>(
  queryFn: (client: SupabaseClient<Database>) => Promise<{ data: T | null; error: unknown }>
): Promise<T> {
  const { data, error } = await queryFn(getSupabase());
  if (error) {
    throw error;
  }
  if (data === null) {
    throw new Error('Query returned null');
  }
  return data;
}
