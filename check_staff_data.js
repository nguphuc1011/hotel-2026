
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkStaffData() {
  const { data: staff } = await supabase.from('staff').select('id, full_name, role');
  console.log('Staff count:', staff.length);
  staff.forEach(s => {
    console.log(`ID: ${s.id} | Name: ${s.full_name} | Role: ${s.role}`);
  });

  // Also check overrides
  const { data: rolePolicies } = await supabase.from('security_role_policies').select('*');
  console.log('Role Policies:', rolePolicies);
}

checkStaffData().catch(console.error);
