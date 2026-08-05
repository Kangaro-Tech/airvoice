import { getSupabase } from './src/config/supabase';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('company_payments')
    .select(`*`);
    
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
