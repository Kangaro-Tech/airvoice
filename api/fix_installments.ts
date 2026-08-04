import { initSupabase, getSupabase } from './src/config/supabase';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const sb = getSupabase();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  // Find all pending installments
  const { data, error } = await sb
    .from('installments')
    .select('id, due_year, due_month, expected_amount')
    .eq('status', 'pending');

  if (error) {
    console.error('Error fetching pending installments:', error);
    return;
  }

  let updatedCount = 0;
  for (const inst of (data || [])) {
    const isPastDue = (inst.due_year < currentYear) || (inst.due_year === currentYear && inst.due_month < currentMonth);
    
    if (isPastDue) {
      const { error: updateErr } = await sb
        .from('installments')
        .update({
          status: 'not_deducted',
          arrears_amount: inst.expected_amount
        })
        .eq('id', inst.id);
      
      if (!updateErr) updatedCount++;
    }
  }

  console.log(`Successfully retroactively fixed ${updatedCount} past-due pending installments.`);
}

main();
