const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Testing Supabase connection...');
  const tables = ['rooms', 'bookings', 'customers', 'services', 'invoices', 'expenses', 'settings'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table}: FAIL (${error.message})`);
    } else {
      console.log(`Table ${table}: OK (Empty or Data present)`);
    }
  }
}

async function seed() {
  const tables = ['customers', 'bookings', 'invoices', 'expenses', 'settings'];
  for (const table of tables) {
    console.log(`\n--- Probing table: ${table} ---`);
    const { data, error } = await supabase.from(table).insert([{}]).select();
    if (error) {
      console.log(`Table ${table} Error: ${error.message}`);
    } else if (data && data.length > 0) {
      console.log(`Table ${table} Columns:`, Object.keys(data[0]));
      // Delete the test row
      await supabase.from(table).delete().eq('id', data[0].id);
    }
  }
}

async function run() {
  await test();
  await seed();
}

run();
