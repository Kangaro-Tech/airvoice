import { initSupabase, getSupabase } from './src/config/supabase';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('company_payments')
    .select(`
      *,
      customer:customers(id, full_name, service_number, phone_number),
      application:applications(id, ref_number, monthly_amount),
      installment:installments(id, due_date, expected_amount)
    `);
  
  console.log("Error:", error);
  console.log("Data length:", data?.length);
}
test();
