const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './services/api/.env' });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function inspect() {
  const { data, error } = await supabase.from('phone_models').select('*').limit(1);
  if (error) {
    console.error('Error fetching phone_models:', error);
  } else if (data && data.length > 0) {
    console.log('Columns in phone_models:', Object.keys(data[0]));
    console.log('Sample record:', data[0]);
  } else {
    console.log('No records in phone_models');
  }
}

inspect();
