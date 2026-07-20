/**
 * get-ids.ts
 * Reads back actual UUIDs from Supabase and prints them for checklist.ts update.
 * Usage: npx tsx src/scripts/get-ids.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('\n🔍  Reading current seed IDs from Supabase...\n');

  const { data: users } = await supabase
    .from('users')
    .select('id, firebase_uid, role, phone_number')
    .in('firebase_uid', [
      'dev-super-admin-uid', 'dev-admin-uid', 'dev-finance-uid', 'dev-camp-uid',
      'dev-sales-uid', 'dev-accountant-uid', 'dev-recovery-uid', 'dev-inventory-uid',
      'dev-customer-uid', 'dev-guarantor-uid',
    ]);
  console.log('👤 Users:');
  users?.forEach(u => console.log(`  ${u.firebase_uid.padEnd(25)} → ${u.id}  (${u.role})`));

  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, nic_number, service_number')
    .in('nic_number', ['198512345678', '199012345678', '198712345679', '197012345678', '198812345678']);
  console.log('\n👥 Customers:');
  customers?.forEach(c => console.log(`  ${c.service_number?.padEnd(15)} ${c.full_name?.padEnd(35)} → ${c.id}`));

  const { data: apps } = await supabase
    .from('applications')
    .select('id, ref_number, status')
    .in('ref_number', ['AV-2024-0001', 'AV-2024-0002', 'AV-2024-0003', 'AV-2024-0004']);
  console.log('\n📱 Applications:');
  apps?.forEach(a => console.log(`  ${a.ref_number}  → ${a.id}  (${a.status})`));

  const { data: camps } = await supabase
    .from('camps')
    .select('id, name')
    .in('name', ['Panagoda Army Camp']);
  console.log('\n🏕️  Camps:');
  camps?.forEach(c => console.log(`  ${c.name.padEnd(30)} → ${c.id}`));

  const { data: batches } = await supabase
    .from('legacy_import_batches')
    .select('id, file_name')
    .eq('file_name', '7ESR_deductions_2024.xlsx');
  console.log('\n📂 Legacy Batches:');
  batches?.forEach(b => console.log(`  ${b.file_name.padEnd(35)} → ${b.id}`));

  console.log('');
}

main().catch(console.error);
