
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Finding create_booking RPC ---');
    const res = await client.query(`
        SELECT proname, prosrc
        FROM pg_proc
        WHERE proname = 'create_booking'
    `);
    
    res.rows.forEach(r => {
        console.log(`\n=== Function: ${r.proname} ===`);
        console.log(r.prosrc);
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
