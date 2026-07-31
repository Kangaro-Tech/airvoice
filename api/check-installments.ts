import { getSupabase } from './src/config/supabase'; getSupabase().rpc('get_unique_constraints', { table_name: 'installments' }).then(console.log);
