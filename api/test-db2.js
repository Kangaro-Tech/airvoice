const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'f:/australia company project/airVoice/airvoice/api/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('applications').select('*').eq('id', 'b7aaf03f-9884-4079-9fd3-a68db370a35f');
  console.log('App:', data);
  const custRes = await supabase.from('customers').select('*').eq('id', '5d934556-ddbd-4e9a-80e0-21232edacd15');
  console.log('Customer:', custRes.data);
}
run();
