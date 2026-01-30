
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkStaffColumns() {
  const { data, error } = await supabase.from('staff').select('*').limit(1);
  if (error) console.log(error.message);
  else console.log('Columns:', Object.keys(data[0]));
}

checkStaffColumns().catch(console.error);
