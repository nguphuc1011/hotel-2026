const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function verify() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT routine_definition 
      FROM information_schema.routines 
      WHERE routine_name = 'fn_calculate_room_charge' 
      AND routine_schema = 'public'
    `);
    
    if (res.rows.length > 0) {
      const def = res.rows[0].routine_definition;
      if (def.includes('v_custom_price')) {
        console.log('VERIFICATION SUCCESS: v_custom_price found in DB function.');
      } else {
        console.log('VERIFICATION FAILED: v_custom_price NOT found in DB function.');
      }
      
      if (def.includes('v_nights := (p_check_out::date - p_check_in::date)')) {
        console.log('VERIFICATION SUCCESS: Multi-day overnight logic found.');
      } else {
        console.log('VERIFICATION FAILED: Multi-day overnight logic NOT found.');
      }
    } else {
      console.log('Function not found in DB.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
verify();
