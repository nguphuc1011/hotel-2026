const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT oid, pg_get_function_identity_arguments(oid) as sig, prosrc 
    FROM pg_proc 
    WHERE proname = 'close_shift'
  `);

  res.rows.forEach(r => {
    console.log('=== close_shift (' + r.sig + ') ===');
    console.log(r.prosrc);
  });

  await client.end();
}
run().catch(console.error);
