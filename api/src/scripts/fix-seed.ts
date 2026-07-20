/**
 * fix-seed.ts
 * Inserts missing seed data using the actual IDs found in the database.
 * Run: npx tsx src/scripts/fix-seed.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Actual IDs from the database (read via get-ids.ts)
const DB = {
  U_SUPER_ADMIN: '20000000-0000-0000-0000-000000000001',
  U_ADMIN:       '20000000-0000-0000-0000-000000000002',
  U_FINANCE:     '20000000-0000-0000-0000-000000000003',
  U_CAMP:        '20000000-0000-0000-0000-000000000004',
  U_SALES:       '20000000-0000-0000-0000-000000000005',
  U_ACCOUNTANT:  '20000000-0000-0000-0000-000000000006',
  U_RECOVERY:    '20000000-0000-0000-0000-000000000007',
  U_INVENTORY:   '20000000-0000-0000-0000-000000000008',
  U_CUSTOMER:    '20000000-0000-0000-0000-000000000010',
  U_GUARANTOR:   '20000000-0000-0000-0000-000000000011',
  C001:          '10000000-0000-0000-0000-000000000001',
  C002:          '10000000-0000-0000-0000-000000000002',
  C003:          '10000000-0000-0000-0000-000000000003',
  C004:          '10000000-0000-0000-0000-000000000004',
  C005:          '10000000-0000-0000-0000-000000000005',
  A001:          '30000000-0000-0000-0000-000000000001',
  A002:          '30000000-0000-0000-0000-000000000002',
  A003:          '30000000-0000-0000-0000-000000000003',
  A004:          '30000000-0000-0000-0000-000000000004',
  LB001:         '40000000-0000-0000-0000-000000000001',
  CAMP_PANAGODA: 'c1000000-0000-0000-0000-000000000001',
  PM_MODEL_X7:   null as string | null,
  PM_LITE_S3:    null as string | null,
  PM_PRO_12:     null as string | null,
  PM_GALAXY_A25: null as string | null,
};

async function upsert(table: string, rows: object[], conflictCols: string | string[] = 'id') {
  const onConflict = Array.isArray(conflictCols) ? conflictCols.join(',') : conflictCols;
  const { error } = await supabase.from(table).upsert(rows as any, { onConflict });
  if (error) console.warn(`  ⚠️  ${table}: ${error.message}`);
  else console.log(`  ✅  ${table}: ${rows.length} row(s)`);
}

async function main() {
  console.log('\n🔧  AIRVOICE Fix-Seed (missing records)\n');

  // Get phone model IDs
  const { data: models } = await supabase.from('phone_models').select('id, model');
  const modelMap: Record<string, string> = {};
  models?.forEach((m: any) => { modelMap[m.model] = m.id; });
  DB.PM_MODEL_X7   = modelMap['Model X7']   ?? null;
  DB.PM_LITE_S3    = modelMap['Lite S3']    ?? null;
  DB.PM_PRO_12     = modelMap['Pro 12']     ?? null;
  DB.PM_GALAXY_A25 = modelMap['Galaxy A25'] ?? null;
  console.log('📱 Phone Models:', Object.entries(modelMap).map(([k,v]) => `${k}=${v}`).join(', '));

  // If no phone models, create them
  if (!DB.PM_MODEL_X7) {
    const { data: pm, error } = await supabase.from('phone_models').insert([
      { brand: 'AIRVOICE', model: 'Lite S3',    storage: '64GB',  color: 'Black',      sale_price: 72000  },
      { brand: 'AIRVOICE', model: 'Model X7',   storage: '128GB', color: 'Navy Blue',  sale_price: 89900  },
      { brand: 'AIRVOICE', model: 'Pro 12',     storage: '256GB', color: 'Space Grey', sale_price: 125000 },
      { brand: 'Samsung',  model: 'Galaxy A25', storage: '128GB', color: 'Blue',       sale_price: 95000  },
      { brand: 'Redmi',    model: 'Note 13',    storage: '128GB', color: 'Black',      sale_price: 78000  },
    ]).select();
    if (error) console.warn(`  ⚠️  phone_models insert: ${error.message}`);
    else {
      pm?.forEach((m: any) => { modelMap[m.model] = m.id; });
      DB.PM_MODEL_X7   = modelMap['Model X7']   ?? null;
      DB.PM_LITE_S3    = modelMap['Lite S3']    ?? null;
      DB.PM_PRO_12     = modelMap['Pro 12']     ?? null;
      DB.PM_GALAXY_A25 = modelMap['Galaxy A25'] ?? null;
      console.log(`  ✅  phone_models created`);
    }
  }

  // Update firebase_uid of existing super_admin/admin users to match test token UIDs (dev-* prefix)
  const { error: saErr } = await supabase.from('users')
    .update({ firebase_uid: 'dev-super-admin-uid' })
    .eq('id', DB.U_SUPER_ADMIN);
  if (saErr) console.warn(`  ⚠️  super_admin firebase_uid update: ${saErr.message}`);
  else console.log('  ✅  users: super_admin firebase_uid → dev-super-admin-uid');

  const { error: adErr } = await supabase.from('users')
    .update({ firebase_uid: 'dev-admin-uid' })
    .eq('id', DB.U_ADMIN);
  if (adErr) console.warn(`  ⚠️  admin firebase_uid update: ${adErr.message}`);
  else console.log('  ✅  users: admin firebase_uid → dev-admin-uid');

  // Check for C004 retirement date
  const { data: c4 } = await supabase.from('customers').select('id, retirement_date').eq('id', DB.C004).single();
  if (c4 && !c4.retirement_date) {
    const retireIn90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { error } = await supabase.from('customers').update({ retirement_date: retireIn90 }).eq('id', DB.C004);
    if (error) console.warn(`  ⚠️  C004 retirement_date: ${error.message}`);
    else console.log(`  ✅  C004 retirement_date set to ${retireIn90}`);
  } else {
    console.log(`  ✅  C004 retirement_date: ${c4?.retirement_date ?? 'not found'}`);
  }

  // Camp officer assignment
  const { data: campAssign } = await supabase.from('camp_officer_assignments').select('id').eq('user_id', DB.U_CAMP).eq('camp_id', DB.CAMP_PANAGODA).maybeSingle();
  if (!campAssign) {
    // Need assigned_by; use admin
    const { error } = await supabase.from('camp_officer_assignments').insert({
      user_id: DB.U_CAMP, camp_id: DB.CAMP_PANAGODA, is_active: true, assigned_by: DB.U_ADMIN,
    });
    if (error) console.warn(`  ⚠️  camp_officer_assignments: ${error.message}`);
    else console.log('  ✅  camp_officer_assignments: 1 row');
  } else {
    console.log('  ✅  camp_officer_assignments: already exists');
  }

  // Insert missing applications
  const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  const { data: existApps } = await supabase.from('applications').select('ref_number').in('ref_number', ['AV-2024-0002', 'AV-2024-0003', 'AV-2024-0004']);
  const existRefs = new Set(existApps?.map((a: any) => a.ref_number));
  const missingApps: object[] = [];

  if (!existRefs.has('AV-2024-0002') && DB.PM_LITE_S3) {
    missingApps.push({ id: DB.A002, ref_number: 'AV-2024-0002', customer_id: DB.C002, phone_model_id: DB.PM_LITE_S3, sale_price: 72000, down_payment: 7200, financed_amount: 64800, monthly_amount: 5400, term_months: 12, status: 'active', sales_officer_id: DB.U_SALES, plan_end_date: futureDate(240), sale_date: today });
  }
  if (!existRefs.has('AV-2024-0003') && DB.PM_PRO_12) {
    missingApps.push({ id: DB.A003, ref_number: 'AV-2024-0003', customer_id: DB.C002, phone_model_id: DB.PM_PRO_12, sale_price: 125000, down_payment: 12500, financed_amount: 112500, monthly_amount: 9375, term_months: 12, status: 'active', sales_officer_id: DB.U_SALES, plan_end_date: futureDate(120), sale_date: today });
  }
  if (!existRefs.has('AV-2024-0004') && DB.PM_GALAXY_A25) {
    missingApps.push({ id: DB.A004, ref_number: 'AV-2024-0004', customer_id: DB.C003, phone_model_id: DB.PM_GALAXY_A25, sale_price: 95000, down_payment: 9500, financed_amount: 85500, monthly_amount: 7125, term_months: 12, status: 'submitted', sales_officer_id: DB.U_SALES, plan_end_date: futureDate(360), sale_date: today });
  }

  if (missingApps.length > 0) {
    await upsert('applications', missingApps);
  } else {
    console.log('  ✅  applications: all present');
  }

  // Verify A001 has installments
  const { data: instCount } = await supabase.from('installments').select('id', { count: 'exact', head: true }).eq('application_id', DB.A001);
  console.log(`  ✅  A001 installments: ${(instCount as any)?.length ?? 'checking...'}  (count in DB)`);

  // Delete existing commission for DB.A001 and create clean payable commission
  await supabase.from('commissions').delete().eq('application_id', DB.A001);
  const { error: commErr } = await supabase.from('commissions').insert({
    application_id: DB.A001,
    sales_officer_id: DB.U_SALES,
    customer_id: DB.C001,
    amount: 250,
    status: 'payable',
    became_payable_at: new Date().toISOString(),
  });
  if (commErr) console.warn(`  ⚠️  commissions: ${commErr.message}`);
  else console.log('  ✅  commissions: 1 payable row created');

  // Print final ID map for checklist.ts
  console.log('\n📋  Final ID map for checklist.ts:\n');
  console.log(`  C001: '${DB.C001}'`);
  console.log(`  C002: '${DB.C002}'`);
  console.log(`  C004: '${DB.C004}'`);
  console.log(`  A001: '${DB.A001}'`);
  console.log(`  A004: '${DB.A004}'`);
  console.log(`  LB001: '${DB.LB001}'`);
  console.log(`  CAMP_PANAGODA: '${DB.CAMP_PANAGODA}'`);
  console.log('');
  console.log('✅  Fix-seed complete!\n');
}

main().catch(console.error);
