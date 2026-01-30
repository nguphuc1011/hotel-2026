
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkSchema() {
  console.log('Checking schema for "tam" or "temp"...');
  
  // Get all tables
  const { data: tables, error } = await supabase.rpc('get_tables_info'); // Assuming this RPC doesn't exist, I'll use a direct query if possible, or just list common ones.
  // Actually, standard Supabase client doesn't give schema access easily without admin.
  // I'll try to use the 'information_schema' via a direct SQL query if I can, but I can't run raw SQL easily without a helper.
  // I'll use the 'rpc' to call a known function or just inspect known tables.
  
  // Let's try to list columns of 'bookings' and 'rooms' and 'payments'
  const tablesToCheck = ['bookings', 'rooms', 'payments', 'customer_transactions', 'deposit_logs', 'temporary_bills'];
  
  for (const table of tablesToCheck) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
        console.log(`Table '${table}' check:`, error.message);
    } else {
        console.log(`Table '${table}' exists. Keys:`, data && data.length > 0 ? Object.keys(data[0]).join(', ') : 'Empty table');
    }
  }
}

checkSchema().catch(console.error);
