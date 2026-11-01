const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const custId = 'a6f52cae-525c-4ba5-9860-dddd02f52908';
    const txs = await client.query(`
      SELECT type, amount, balance_before, balance_after, description, created_at
      FROM public.customer_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [custId]);
    console.table(txs.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
