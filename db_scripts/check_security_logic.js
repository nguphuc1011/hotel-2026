const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function checkSecurity() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT key, policy_type, is_enabled 
      FROM public.settings_security 
      WHERE key IN ('checkin_cancel_booking', 'checkout_void_bill')
    `);
    console.log('Security Settings:');
    console.log(JSON.stringify(res.rows, null, 2));

    const resRpc = await client.query(`
      SELECT routine_name, pg_get_functiondef(p.oid) 
      FROM pg_proc p 
      JOIN pg_namespace n ON n.oid = p.pronamespace 
      WHERE n.nspname = 'public' AND p.proname = 'cancel_booking'
    `);
    if (resRpc.rows.length > 0) {
      console.log('\nRPC Definition:');
      console.log(resRpc.rows[0].pg_get_functiondef);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkSecurity();
