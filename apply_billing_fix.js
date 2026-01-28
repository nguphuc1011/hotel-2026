const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyFix() {
  console.log('Reading billing_engine.sql...');
  const sql = fs.readFileSync(path.join(__dirname, 'src/lib/billing_engine.sql'), 'utf8');

  console.log('Applying SQL fixes...');
  
  // Supabase RPC 'exec_sql' doesn't exist by default, but we can use a trick 
  // or if we have it defined. Since we don't know, we'll try to run it via a temporary function.
  
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    if (error.message.includes('function "exec_sql" does not exist')) {
        console.error('Error: exec_sql function not found in database.');
        console.log('Please run the content of src/lib/billing_engine.sql manually in Supabase SQL Editor.');
    } else {
        console.error('Error applying fix:', error);
    }
    process.exit(1);
  }

  console.log('Fix applied successfully!');
}

applyFix();
