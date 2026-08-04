import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return;
  const res = await fetch(`${url}/rest/v1/?apikey=${key}`);
  const data = await res.json();
  const paths = Object.keys(data.paths);
  console.log("Paths include company_payments:", paths.includes('/company_payments'));
  
  const def = data.definitions?.company_payments;
  console.log("Def:", def);
}
test();
