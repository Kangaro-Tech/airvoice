const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'f:/australia company project/airVoice/airvoice/api/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const apps = await supabase.from('applications').select('id, customer_id, ref_number').limit(5);
  console.log('Apps:', apps.data);
  const custs = await supabase.from('customers').select('id, full_name').limit(5);
  console.log('Customers:', custs.data);
}
run();
