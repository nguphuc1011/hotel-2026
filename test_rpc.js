
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const staffId = 'c995de66-19a3-4504-98f9-c522b7291e22'; // Namletan
  const action = 'checkin_cancel_booking';
  
  console.log('Testing fn_resolve_policy...');
  const { data, error } = await supabase.rpc('fn_resolve_policy', {
    p_staff_id: staffId,
    p_action_key: action
  });
  
  console.log('Data:', data);
  console.log('Error:', error);
}

test().catch(console.error);
