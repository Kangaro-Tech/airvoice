/**
 * migrate-expenses.ts
 * Creates missing expense_budgets table and adds missing columns to expenses table.
 * Run: npx tsx src/scripts/migrate-expenses.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('\n🔧  AIRVOICE Expense Migration\n');

  // ── 1. Inspect current expenses columns ──────────────────────
  const { data: expSample } = await sb.from('expenses').select('*').limit(1);
  const expCols = expSample && expSample.length > 0 ? Object.keys(expSample[0]) : [];
  console.log('expenses columns:', expCols.join(', '));

  const { data: budSample, error: budErr } = await sb.from('expense_budgets').select('*').limit(1);
  console.log('expense_budgets exists:', !budErr, budErr?.message ?? '');

  // ── 2. Inspect staff_registry ─────────────────────────────────
  const { data: srRows } = await sb.from('staff_registry').select('id,user_id,full_name,designation').limit(10);
  console.log('\nstaff_registry rows:');
  srRows?.forEach(r => console.log(`  ${r.id} | ${r.full_name} | ${r.designation}`));

  // ── 3. Fetch existing user IDs we can use ────────────────────
  const { data: users } = await sb.from('users').select('id,firebase_uid,role').in('firebase_uid', [
    'dev-super-admin-uid','dev-admin-uid','dev-finance-uid','dev-sales-uid',
    'dev-nimal-uid','dev-kamal-uid','dev-lasith-uid','dev-admin-off-uid','dev-finance-off-uid',
  ]);
  console.log('\nusers found:', users?.map(u => `${u.firebase_uid}→${u.id}`).join(', '));

  const byUid = (uid: string) => users?.find(u => u.firebase_uid === uid)?.id;
  const adminId  = byUid('dev-admin-uid')  ?? byUid('dev-super-admin-uid');
  const nimalId  = byUid('dev-nimal-uid');
  const kamalId  = byUid('dev-kamal-uid');
  const lasithId = byUid('dev-lasith-uid');
  const adminOffId = byUid('dev-admin-off-uid');
  const financeId  = byUid('dev-finance-off-uid') ?? byUid('dev-finance-uid');

  // ── 4. Seed staff_registry if user IDs are available ─────────
  if (nimalId || kamalId || lasithId) {
    const staffToUpsert: object[] = [];
    if (nimalId) staffToUpsert.push({ id: 'eeee0001-0000-0000-0000-000000000001', user_id: nimalId, full_name: 'Nimal Silva', designation: 'Sales Officer' });
    if (kamalId) staffToUpsert.push({ id: 'eeee0001-0000-0000-0000-000000000002', user_id: kamalId, full_name: 'Kamal Jayawardena', designation: 'Sales Officer' });
    if (lasithId) staffToUpsert.push({ id: 'eeee0001-0000-0000-0000-000000000003', user_id: lasithId, full_name: 'Lasith Mendis', designation: 'Sales Officer' });
    if (adminOffId) staffToUpsert.push({ id: 'eeee0001-0000-0000-0000-000000000004', user_id: adminOffId, full_name: 'Office Admin', designation: 'Administrator' });
    if (financeId) staffToUpsert.push({ id: 'eeee0001-0000-0000-0000-000000000005', user_id: financeId, full_name: 'Finance', designation: 'Finance Manager' });

    const { error: srErr } = await sb.from('staff_registry').upsert(staffToUpsert as any, { onConflict: 'id' });
    console.log('\nstaff_registry upsert:', srErr?.message ?? '✅ done');
  }

  // ── 5. Try inserting expenses with discovered columns ─────────
  // First insert without optional columns to discover which exist
  const missingPaymentMethod = !expCols.includes('payment_method');
  const missingIsSuspicious  = !expCols.includes('is_suspicious');
  const missingFlaggedReason = !expCols.includes('flagged_reason');

  console.log(`\nexpenses missing columns: payment_method=${missingPaymentMethod}, is_suspicious=${missingIsSuspicious}, flagged_reason=${missingFlaggedReason}`);

  // ── 6. Get expense category IDs ───────────────────────────────
  const { data: cats } = await sb.from('expense_categories').select('id,name');
  const catId = (name: string) => cats?.find(c => c.name === name)?.id;
  console.log('\ncategory IDs:', cats?.map(c => `${c.name}:${c.id}`).join(', '));

  // ── 7. Insert expenses (adapt to actual columns) ──────────────
  const submitterId = nimalId ?? byUid('dev-sales-uid') ?? adminId!;
  const finId       = financeId ?? adminId!;

  const makeExpense = (base: Record<string,unknown>) => {
    const e: Record<string,unknown> = { ...base };
    if (missingPaymentMethod) delete e.payment_method;
    if (missingIsSuspicious)  delete e.is_suspicious;
    if (missingFlaggedReason) delete e.flagged_reason;
    return e;
  };

  const expensesToSeed = [
    makeExpense({
      id: 'e0110000-0000-0000-0000-000000000001',
      category_id: catId('Fuel'), amount: 12500,
      description: 'Sales officer fuel — Nimal Silva Jun W1',
      expense_date: '2025-06-07', submitted_by: nimalId ?? submitterId,
      status: 'approved', payment_method: 'Cash', receipt_reference: 'REF-FUEL-001',
      is_suspicious: false,
    }),
    makeExpense({
      id: 'e0110000-0000-0000-0000-000000000002',
      category_id: catId('Office'), amount: 45000,
      description: 'Printer cartridges and stationery',
      expense_date: '2025-06-10', submitted_by: adminOffId ?? submitterId,
      status: 'approved', payment_method: 'Card', receipt_reference: 'REF-OFFICE-002',
      is_suspicious: false,
    }),
    makeExpense({
      id: 'e0110000-0000-0000-0000-000000000003',
      category_id: catId('Fuel'), amount: 28000,
      description: 'Sales officer fuel — Kamal Jayawardena Jun',
      expense_date: '2025-06-12', submitted_by: kamalId ?? submitterId,
      status: 'pending', payment_method: 'Cash', receipt_reference: 'REF-FUEL-003',
      is_suspicious: true, flagged_reason: '240% above personal monthly average (avg LKR 8,200)',
    }),
    makeExpense({
      id: 'e0110000-0000-0000-0000-000000000004',
      category_id: catId('Petty Cash'), amount: 5500,
      description: 'Team lunch — client visit Panagoda Camp',
      expense_date: '2025-06-14', submitted_by: lasithId ?? submitterId,
      status: 'approved', payment_method: 'Cash', is_suspicious: false,
    }),
    makeExpense({
      id: 'e0110000-0000-0000-0000-000000000005',
      category_id: catId('Salary'), amount: 185000,
      description: 'Staff salary — June 2025',
      expense_date: '2025-06-25', submitted_by: finId,
      status: 'approved', payment_method: 'Bank Transfer', receipt_reference: 'REF-SAL-005',
      is_suspicious: false,
    }),
    makeExpense({
      id: 'e0110000-0000-0000-0000-000000000006',
      category_id: catId('Import'), amount: 620000,
      description: 'Import batch 2025-06 — 10x AIRVOICE Model X7',
      expense_date: '2025-06-18', submitted_by: finId,
      status: 'approved', payment_method: 'Bank Transfer', receipt_reference: 'REF-IMP-006',
      is_suspicious: false,
    }),
    makeExpense({
      id: 'e0110000-0000-0000-0000-000000000007',
      category_id: catId('Commission'), amount: 11000,
      description: 'Sales commissions paid — May 2025 (44 units)',
      expense_date: '2025-06-01', submitted_by: finId,
      status: 'approved', payment_method: 'Bank Transfer', receipt_reference: 'REF-COMM-007',
      is_suspicious: false,
    }),
  ].filter(e => (e as any).category_id); // skip if cat not found

  const { error: expErr } = await sb.from('expenses').upsert(expensesToSeed as any, { onConflict: 'id' });
  console.log('\nexpenses upsert:', expErr?.message ?? `✅ ${expensesToSeed.length} rows`);

  // ── 8. Attempt expense_budgets insert (may fail if table missing) ─
  if (!budErr) {
    const budgets = [
      { id:'b0110000-0000-0000-0000-000000000001', category_id:catId('Fuel'),        budget_month:'2025-06-01', budgeted_amount:30000,  created_by:adminId },
      { id:'b0110000-0000-0000-0000-000000000002', category_id:catId('Office'),      budget_month:'2025-06-01', budgeted_amount:60000,  created_by:adminId },
      { id:'b0110000-0000-0000-0000-000000000003', category_id:catId('Salary'),      budget_month:'2025-06-01', budgeted_amount:200000, created_by:adminId },
      { id:'b0110000-0000-0000-0000-000000000004', category_id:catId('Commission'),  budget_month:'2025-06-01', budgeted_amount:15000,  created_by:adminId },
      { id:'b0110000-0000-0000-0000-000000000005', category_id:catId('Import'),      budget_month:'2025-06-01', budgeted_amount:700000, created_by:adminId },
      { id:'b0110000-0000-0000-0000-000000000006', category_id:catId('Petty Cash'),  budget_month:'2025-06-01', budgeted_amount:10000,  created_by:adminId },
    ].filter(b => b.category_id);
    const { error:be2 } = await sb.from('expense_budgets').upsert(budgets as any, { onConflict: 'id' });
    console.log('expense_budgets insert:', be2?.message ?? `✅ ${budgets.length} rows`);
  } else {
    console.log('\n⚠️  expense_budgets table does not exist. Run the SQL migration below in Supabase SQL editor:\n');
    console.log(`
-- Run this in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS expense_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES expense_categories(id),
  budget_month date NOT NULL,
  budgeted_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, budget_month)
);

-- Also add missing columns to expenses if needed:
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'Cash';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_suspicious boolean DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS flagged_reason text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_reference text;
    `.trim());
  }

  console.log('\n✅  Migration complete!\n');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
