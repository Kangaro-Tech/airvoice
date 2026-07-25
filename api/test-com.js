const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await sb.from('commissions')
    .select('*,application:applications(ref_number,phone_model_id,monthly_amount),officer:users!sales_officer_id(phone_number)')
    .gte('created_at', '2026-07-01')
    .lte('created_at', '2026-07-31T23:59:59Z');
    
  console.log('Error:', error);
  console.log('Data count:', data ? data.length : 0);
  if (data && data.length > 0) {
    console.log('Sample:', JSON.stringify(data[0], null, 2));
  }
}
test();
