import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase.from('special_approval_requests').select('*');
  if (error) {
    console.error('Error fetching requests:', error);
    process.exit(1);
  }
  console.log('--- ALL SPECIAL APPROVAL REQUESTS ---');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
