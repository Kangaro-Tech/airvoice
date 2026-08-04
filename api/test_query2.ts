import { getSupabase } from './src/config/supabase';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const sb = getSupabase();
  const { data, error } = await sb
    .rpc('get_foreign_keys'); // Supabase doesn't have this by default

  const { data: cols, error: err2 } = await sb
    .from('company_payments')
    .select('*')
    .limit(1);
    
  console.log("Cols:", Object.keys(cols?.[0] || {}));
}
test();
