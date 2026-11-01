const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const procName = process.argv[2];
  if (!procName) {
    console.error('Please provide a procedure name');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`
    SELECT p.oid, p.proname, 
           pg_get_function_identity_arguments(p.oid) as sig,
           pg_get_function_arguments(p.oid) as args,
           p.prosrc as body
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = $1
  `, [procName]);

  for (const r of res.rows) {
    console.log(`\n=== ${r.proname} (${r.sig}) ===`);
    console.log(r.body);
  }
  await client.end();
}
run().catch(console.error);
