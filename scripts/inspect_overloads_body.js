const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const overloads = [
    'change_room',
    'close_shift',
    'fn_create_cash_flow',
    'fn_get_all_user_floors_map',
    'fn_get_available_floors',
    'fn_get_recorded_expected_revenue',
    'get_last_shift_balance',
    'get_system_settings',
    'open_shift'
  ];

  for (const name of overloads) {
    const res = await client.query(`
      SELECT oid, proname, 
             pg_get_function_identity_arguments(oid) as signature,
             pg_get_function_arguments(oid) as args_with_defaults,
             prosrc as body
      FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname = $1
    `, [name]);

    console.log(`\n======================================================`);
    console.log(`FUNCTION: ${name} (${res.rows.length} variants)`);
    console.log(`======================================================`);
    res.rows.forEach((r, idx) => {
      console.log(`--- Variant #${idx + 1} (OID: ${r.oid}) ---`);
      console.log(`Signature: (${r.signature})`);
      console.log(`Args: ${r.args_with_defaults}`);
      console.log(`Body snippet: ${r.body.slice(0, 300).replace(/\n/g, ' ')}...`);
    });
  }

  await client.end();
}
run().catch(console.error);
