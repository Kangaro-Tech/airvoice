import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log("Checking guarantors requests join...");
  const { data, error } = await supabase.from('guarantors')
    .select(`
      id,
      guarantor_requests(id)
    `).limit(1);
  console.log("Guarantors -> guarantor_requests:", error?.message || "OK");
  
  console.log("Checking guarantor_requests -> applications...");
  const { data: gData, error: gError } = await supabase.from('guarantor_requests')
    .select('id, application:applications(id)').limit(1);
  console.log("requests -> applications:", gError?.message || "OK");
}
main().catch(console.error);
