const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  try {
    const functions = ['calculate_booking_bill_v2', 'fn_calculate_room_charge', 'fn_calculate_surcharge'];
    
    for (const func of functions) {
      console.log(`--- FETCHING DEFINITION FOR: ${func} ---`);
      const res = await client.query(`
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = $1
      `, [func]);
      
      if (res.rows.length > 0) {
        console.log(res.rows[0].definition);
      } else {
        console.log(`Function ${func} not found.`);
      }
      console.log('\n\n');
    }

    console.log('--- CHECKING SETTINGS TABLE VALUES ---');
    const settingsRes = await client.query('SELECT * FROM settings LIMIT 1');
    console.log(JSON.stringify(settingsRes.rows[0], null, 2));

    console.log('--- CHECKING BOOKINGS TABLE SCHEMA (for custom_price/surcharge) ---');
    const columnsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      AND column_name IN ('initial_price', 'custom_price', 'custom_surcharge', 'discount_amount')
    `);
    console.log(columnsRes.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
