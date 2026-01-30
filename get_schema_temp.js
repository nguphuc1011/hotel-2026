
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getTableSchema(tableName) {
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_schema', 'public')
    .eq('table_name', tableName);

  if (error) {
    console.error(`Error fetching schema for ${tableName}:`, error);
    return;
  }
  console.log(`--- ${tableName} Schema ---`);
  console.table(data);
}

async function getRpcDefinition(rpcName) {
    const { data, error } = await supabase
        .rpc('get_function_definition', { func_name: rpcName }); // Assuming there might be a helper, or just query pg_proc
    
    // Direct query to pg_proc is not allowed via PostgREST usually unless exposed.
    // But we can try to call a known RPC if exists, or just use the inspect script if I can make it work.
    // Alternatively, I'll just print what I can find.
    
    // Let's try to query information_schema.routines? No, body is not there usually.
    // I will rely on `rpc_defs.sql` which I read earlier for `process_checkout` and `check_in_customer`.
    // But `calculate_booking_bill` was not fully in `rpc_defs.sql` (I might have missed it or it was truncated).
    
    // I'll try to find `calculate_booking_bill` in `rpc_defs.sql` using Grep.
}

async function main() {
  await getTableSchema('bookings');
  await getTableSchema('rooms');
  await getTableSchema('customers');
}

main();
