import { initSupabase, getSupabase } from './src/config/supabase';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('installments')
    .select('id, due_date, status, arrears_amount, expected_amount')
    .order('due_date', { ascending: false })
    .limit(20);
    
  console.log('Recent installments:', JSON.stringify(data, null, 2));

  // Count installments by status
  const { data: countData } = await sb.from('installments').select('status, arrears_amount');
  const counts = countData?.reduce((acc: any, curr: any) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});
  console.log('Installment Status Counts:', counts);
}

main();
