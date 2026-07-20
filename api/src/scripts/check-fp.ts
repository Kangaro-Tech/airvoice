import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase.from('free_phone_requests').select('*');
  if (error) {
    console.error('Error fetching free phone requests:', error);
    process.exit(1);
  }
  console.log('Query succeeded! Data count:', data?.length);
  console.log('Sample data:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
