const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './api/.env' });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('=== GUARANTORS TABLE CHECK ===');
  const { data: gus, error: guErr, count: guCount } = await sb
    .from('guarantors')
    .select('*', { count: 'exact' })
    .limit(5);
  console.log('Total guarantors:', guCount);
  console.log('Error:', guErr?.message || 'none');
  if (gus && gus.length > 0) {
    console.log('Sample columns:', Object.keys(gus[0]));
    console.log('Sample row:', JSON.stringify(gus[0], null, 2));
  }

  console.log('\n=== APPLICATIONS WITH guarantor_id ===');
  const { count: withGu, error: appErr } = await sb
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .not('guarantor_id', 'is', null);
  console.log('Apps with guarantor_id set:', withGu, appErr?.message || '');

  console.log('\n=== GUARANTOR_REQUESTS TABLE ===');
  const { count: reqCount } = await sb
    .from('guarantor_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted');
  console.log('Accepted guarantor_requests:', reqCount);

  console.log('\n=== TEST INSERT (dry run — will rollback) ===');
  const testInsert = {
    full_name: 'TEST GUARANTOR DELETE ME',
    phone_number: '0771234567',
    nic_number: null,
    service_number: 'TEST/00001',
    branch: 'army',
    camp_id: null,
    monthly_salary: 0,
    total_liability: 0,
    affordability_checked: true,
    affordability_ok: true,
    is_active: true,
    customer_id: null,
  };
  const { data: inserted, error: insertErr } = await sb
    .from('guarantors')
    .insert(testInsert)
    .select('id, full_name')
    .single();
  if (insertErr) {
    console.log('INSERT ERROR:', insertErr.message, insertErr.details, insertErr.hint);
  } else {
    console.log('Insert success! id:', inserted?.id);
    // Delete test row
    await sb.from('guarantors').delete().eq('id', inserted.id);
    console.log('Test row deleted.');
  }
}

main().catch(console.error);
