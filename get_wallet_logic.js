
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const res = await client.query(`
        SELECT prosrc
        FROM pg_proc
        WHERE proname = 'fn_apply_wallet_logic'
    `);
    
    if (res.rows.length > 0) {
        console.log(res.rows[0].prosrc);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
