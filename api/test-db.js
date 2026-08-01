const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'f:/australia company project/airVoice/airvoice/api/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('installments').select('*').limit(2);
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
run();
