const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('--- Wallet Schema ---');
    const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'wallets'");
    console.table(cols.rows);

    console.log('\n--- Constraints ---');
    const cons = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'wallets'
    `);
    console.table(cons.rows);

    console.log('\n--- Data Sample ---');
    const data = await client.query("SELECT id, hotel_id, name, balance FROM public.wallets");
    console.table(data.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

check();
