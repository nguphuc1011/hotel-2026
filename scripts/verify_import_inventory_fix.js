const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // USE ANON KEY TO SIMULATE FRONTEND

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const pgClient = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    await pgClient.connect();
    console.log('Connected to DB.');

    // 1. Get a test service and staff
    const serviceRes = await pgClient.query("SELECT id, name, stock_quantity FROM services WHERE is_active = true LIMIT 1");
    if (serviceRes.rows.length === 0) throw new Error('No active service found');
    const service = serviceRes.rows[0];
    console.log('Test Service:', service.name, 'Stock:', service.stock_quantity);

    const staffRes = await pgClient.query("SELECT id, username FROM staff WHERE is_active = true LIMIT 1");
    if (staffRes.rows.length === 0) throw new Error('No active staff found');
    const staff = staffRes.rows[0];
    console.log('Test Staff:', staff.username);

    // 2. Call RPC as ANON (simulating frontend)
    const qty = 1;
    const amount = 1000;
    const notes = 'Test Import Fix via Script';

    console.log('Calling RPC import_inventory...');
    const { data, error } = await supabase.rpc('import_inventory', {
      p_service_id: service.id,
      p_qty_buy: qty,
      p_total_amount: amount,
      p_notes: notes,
      p_staff_id: staff.id // PASSING STAFF ID EXPLICITLY
    });

    if (error) {
      console.error('RPC Error:', error);
      throw error;
    }
    console.log('RPC Success:', data);

    // 3. Verify Database
    console.log('Verifying DB records...');
    
    // Check Transaction
    const txRes = await pgClient.query(
      "SELECT * FROM transactions WHERE id = $1", 
      [data.transaction_id]
    );
    const tx = txRes.rows[0];
    console.log('Transaction Staff ID:', tx.staff_id);
    if (tx.staff_id === staff.id) {
      console.log('✅ Transaction recorded with correct Staff ID');
    } else {
      console.error('❌ Transaction Staff ID mismatch:', tx.staff_id);
    }

    // Check Cash Flow
    const cfRes = await pgClient.query(
      "SELECT * FROM cash_flow WHERE ref_id = $1", 
      [data.transaction_id]
    );
    if (cfRes.rows.length > 0) {
      const cf = cfRes.rows[0];
      console.log('Cash Flow Created By:', cf.created_by);
      if (cf.created_by === staff.id) {
        console.log('✅ Cash Flow recorded with correct Staff ID');
      } else {
        console.error('❌ Cash Flow Staff ID mismatch:', cf.created_by);
      }
    } else {
      console.error('❌ Cash Flow NOT created!');
    }

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    await pgClient.end();
  }
}

main();
