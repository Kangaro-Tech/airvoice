import { getSupabase } from './src/config/supabase';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const sb = getSupabase();

  // 1. Get the "Company Payments" expense category ID
  let { data: catRes } = await sb.from('expense_categories').select('id').eq('name', 'Company Payments').single();
  let catId = catRes?.id;
  
  if (!catId) {
    const { data: newCat } = await sb.from('expense_categories').insert({ name: 'Company Payments', type: 'expense' }).select('id').single();
    catId = newCat?.id;
  }

  if (!catId) {
    console.error('Could not find or create expense category.');
    return;
  }

  // 2. Fetch all company payments that don't have a corresponding expense
  const { data: cps, error: cpErr } = await sb
    .from('company_payments')
    .select('*');

  if (cpErr) {
    console.error('Error fetching company payments:', cpErr);
    return;
  }

  // 3. Fetch all expenses in the category
  const { data: exps, error: expErr } = await sb
    .from('expenses')
    .select('description')
    .eq('category_id', catId);

  const existingDescriptions = new Set((exps || []).map((e: any) => e.description));

  const expensesToInsert = [];
  
  for (const cp of (cps || [])) {
    const description = `Company Payment for Customer ID: ${cp.customer_id} - ${cp.notes || ''}`;
    
    // If an expense with this exact description doesn't exist, we add it
    if (!existingDescriptions.has(description)) {
      expensesToInsert.push({
        category_id: catId,
        amount: cp.amount,
        description: description,
        expense_date: new Date(cp.created_at).toISOString().split('T')[0],
        status: 'approved',
        payment_method: 'Bank Transfer',
        submitted_by: cp.processed_by
      });
    }
  }

  if (expensesToInsert.length > 0) {
    console.log(`Inserting ${expensesToInsert.length} retroactively...`);
    
    for (let i = 0; i < expensesToInsert.length; i += 100) {
      const batch = expensesToInsert.slice(i, i + 100);
      const { error: insErr } = await sb.from('expenses').insert(batch);
      if (insErr) {
        console.error('Failed to insert batch:', insErr);
      }
    }
    console.log('Done injecting existing company payments into expenses.');
  } else {
    console.log('No new company payments to inject into expenses.');
  }
}

main();
