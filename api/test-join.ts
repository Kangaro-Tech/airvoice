import { getSupabase } from './src/config/supabase'; getSupabase().from('customers').select('id, applications(id)').limit(1).then(console.log);
