const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
});

async function run() {
  await client.connect();
  try {
    const names = [
      'calculate_booking_bill_v2',
      'get_booking_bill_v3',
      'check_in_customer',
      'import_inventory',
      'adjust_inventory',
      'register_service_usage',
      'adjust_customer_balance'
    ];
    const res = await client.query(
      `SELECT routine_name 
       FROM information_schema.routines 
       WHERE routine_schema = 'public' 
         AND routine_name = ANY($1)`,
      [names]
    );
    const found = res.rows.map(r => r.routine_name).sort();
    console.log('Found routines:', found);
    const missing = names.filter(n => !found.includes(n));
    console.log('Missing routines:', missing);
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
