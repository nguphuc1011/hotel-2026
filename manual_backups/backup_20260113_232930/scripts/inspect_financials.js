
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAll() {
  console.log('--- Inspecting All Possible Financial Tables ---');
  
  // Try to list all tables or check common names
  const tables = ['customer_transactions', 'ledger', 'transactions', 'shifts', 'expenses'];
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1);
      
    if (error) {
      console.log(`Table ${table}: NOT FOUND or ERROR (${error.message})`);
    } else {
      console.log(`\nTable: ${table} EXISTS`);
      if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]).join(', '));
      } else {
        console.log('Table exists but is empty.');
      }
    }
  }
}

inspectAll();
