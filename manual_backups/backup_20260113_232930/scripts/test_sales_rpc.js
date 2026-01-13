const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('Starting Sales RPC Test...');
  
  try {
    await pgClient.connect();
    
    // 1. Setup Data via PG (Bypass Supabase Client Schema issues)
    console.log('1. Setting up test data (via PG)...');

    // Debug: Check bookings columns
    console.log('   Querying schema...');
    const tables = await pgClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('   Tables:', tables.rows.map(r => r.table_name).join(', '));
    
    const cols = await pgClient.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings'");
    console.log('   Bookings columns:', cols.rows.map(r => r.column_name).join(', '));
    
    // Debug: Check triggers
    const triggers = await pgClient.query("SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'bookings'");
    console.log('   Triggers:', triggers.rows.map(r => r.trigger_name).join(', '));

    // Room
    const roomRes = await pgClient.query("INSERT INTO rooms (room_number, status) VALUES ($1, 'available') RETURNING id", ['TestRoom-' + Date.now()]);
    const roomId = roomRes.rows[0].id;
    console.log('   Room created:', roomId);

    // Customer
    const custRes = await pgClient.query("INSERT INTO customers (full_name) VALUES ($1) RETURNING id", ['Test Customer']);
    const customerId = custRes.rows[0].id;
    console.log('   Customer created:', customerId);

    // Booking
    const bookRes = await pgClient.query(
      "INSERT INTO bookings (room_id, customer_id, check_in_actual, status) VALUES ($1, $2, NOW(), 'checked_in') RETURNING id",
      [roomId, customerId]
    );
    const bookingId = bookRes.rows[0].id;
    console.log('   Booking created:', bookingId);

    // Service
    const serviceRes = await pgClient.query(
      "INSERT INTO services (name, price, stock_quantity, track_inventory, unit) VALUES ($1, 10000, 10, true, 'Chai') RETURNING id",
      ['Test Drink ' + Date.now()]
    );
    const serviceId = serviceRes.rows[0].id;
    console.log('   Service created:', serviceId);

    // 2. Execute RPC via Supabase Client (This is what we want to test)
    console.log('2. Executing register_service_usage RPC...');
    const { data: rpcResult, error: rpcError } = await supabase.rpc('register_service_usage', {
      p_booking_id: bookingId,
      p_service_id: serviceId,
      p_quantity: 2
    });

    if (rpcError) throw new Error('RPC failed: ' + rpcError.message);
    console.log('   RPC Success:', rpcResult);

    // 3. Verify Results via PG
    console.log('3. Verifying results...');
    
    // Check Booking Service
    const bsRes = await pgClient.query("SELECT * FROM booking_services WHERE booking_id = $1 AND service_id = $2", [bookingId, serviceId]);
    if (bsRes.rows.length === 0) console.error('   [FAIL] No booking_services record found');
    else console.log('   [PASS] booking_services record found. Quantity:', bsRes.rows[0].quantity);

    // Check Stock
    const stockRes = await pgClient.query("SELECT stock_quantity FROM services WHERE id = $1", [serviceId]);
    const newStock = stockRes.rows[0].stock_quantity;
    if (newStock === 8) {
      console.log('   [PASS] Stock updated correctly. New stock:', newStock);
    } else {
      console.error('   [FAIL] Stock mismatch. Expected 8, got:', newStock);
    }

    // Check Inventory Log
    const logRes = await pgClient.query("SELECT * FROM inventory_logs WHERE service_id = $1 AND type = 'SALE'", [serviceId]);
    if (logRes.rows.length > 0) {
      console.log('   [PASS] Inventory log found.');
    } else {
      console.error('   [FAIL] No inventory log found.');
    }

    // 4. Cleanup
    console.log('4. Cleanup...');
    await pgClient.query("DELETE FROM booking_services WHERE booking_id = $1", [bookingId]);
    await pgClient.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    await pgClient.query("DELETE FROM inventory_logs WHERE service_id = $1", [serviceId]);
    await pgClient.query("DELETE FROM services WHERE id = $1", [serviceId]);
    await pgClient.query("DELETE FROM rooms WHERE id = $1", [roomId]);
    await pgClient.query("DELETE FROM customers WHERE id = $1", [customerId]);
    console.log('   Cleanup done.');

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    await pgClient.end();
  }
}

main();
