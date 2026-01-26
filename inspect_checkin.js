
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Inspecting check_in_customer ---');
    const res = await client.query(`
        SELECT proname, prosrc
        FROM pg_proc
        WHERE proname = 'check_in_customer'
    `);
    
    res.rows.forEach(r => {
        console.log(r.prosrc);
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
