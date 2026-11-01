const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const triggers = await client.query(`
    SELECT tgname, pg_get_triggerdef(oid) as def
    FROM pg_trigger
    WHERE tgrelid = 'bookings'::regclass
  `);
  console.log('Triggers on bookings:');
  for (const t of triggers.rows) {
    console.log(t.tgname);
    console.log(t.def);
  }

  await client.end();
}

run().catch(console.error);
