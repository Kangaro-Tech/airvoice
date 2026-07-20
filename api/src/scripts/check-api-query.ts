import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase
    .from('special_approval_requests')
    .select(`
      *,
      customer:customers(id, full_name, service_number, nic_number, rank),
      phone_model:phone_models(id, brand, model, sale_price),
      requested_by_user:users!requested_by(id, phone_number),
      application:applications(id, ref_number, status)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase query error:', error);
    process.exit(1);
  }
  console.log('Query succeeded! Data count:', data?.length);
  console.log('Sample data:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
