
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkStaff() {
  console.log('--- STAFF DATA ---');
  const { data: staff, error } = await supabase.from('staff').select('id, name, role').limit(10);
  if (error) console.error(error);
  else console.log(staff);
}

checkStaff().catch(console.error);
