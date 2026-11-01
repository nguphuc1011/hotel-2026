const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const custs = ['1cbaebb8-9824-4901-92db-a5ccb6b8cfcb', '014a5ed6-1a44-407c-830c-7e92effce8f4'];
    for (const cId of custs) {
      console.log(`\n--- CUSTOMER ${cId} ---`);
      const c = await client.query('SELECT * FROM public.customers WHERE id = $1', [cId]);
      console.table(c.rows);
      const txs = await client.query('SELECT * FROM public.customer_transactions WHERE customer_id = $1 ORDER BY created_at ASC', [cId]);
      console.table(txs.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
