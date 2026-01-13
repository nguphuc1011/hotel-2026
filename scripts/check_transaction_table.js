
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Check if customer_transactions table exists
  const { data: tables, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'customer_transactions');

  if (error) {
    console.error('Error checking tables:', error);
    return;
  }

  console.log('Tables found:', tables);

  if (tables && tables.length > 0) {
    // Check columns of customer_transactions
    const { data: columns, error: colErr } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'customer_transactions');
      
    if (colErr) console.error('Error checking columns:', colErr);
    else console.log('Columns:', columns);
  } else {
    console.log('customer_transactions table does not exist.');
  }
}

main();
