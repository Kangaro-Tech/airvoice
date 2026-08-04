import { getSupabase } from './src/config/supabase';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('installments')
    .select('*')
    .limit(2);
  
  console.log("Error:", error);
  console.log("Columns:", Object.keys(data?.[0] || {}));
}
test();
