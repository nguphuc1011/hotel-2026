
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- Inspecting Tables ---');

  const tables = ['settings', 'rooms', 'bookings', 'room_categories', 'customers'];
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1);
      
    if (error) {
      console.log(`Error reading ${table}:`, error.message);
    } else if (data && data.length > 0) {
      console.log(`\nTable: ${table}`);
      console.log('Columns:', Object.keys(data[0]).join(', '));
    } else {
        console.log(`\nTable: ${table} is empty or has no rows.`);
    }
  }
}

inspect();
