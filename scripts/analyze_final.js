const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    let output = '--- Analysis Result ---\n';
    
    const txRes = await client.query(`SELECT id, type, amount, description, created_at FROM public.customer_transactions ORDER BY created_at DESC LIMIT 5`);
    output += '\nRecent customer_transactions:\n' + JSON.stringify(txRes.rows, null, 2);

    const cfRes = await client.query(`SELECT id, category, amount, description, created_at FROM public.cash_flow ORDER BY created_at DESC LIMIT 5`);
    output += '\n\nRecent cash_flow:\n' + JSON.stringify(cfRes.rows, null, 2);

    const bkRes = await client.query(`SELECT id, deposit_amount, status FROM public.bookings WHERE deposit_amount > 0 LIMIT 5`);
    output += '\n\nBookings with deposit > 0:\n' + JSON.stringify(bkRes.rows, null, 2);

    fs.writeFileSync('scripts/ANALYSIS_REAL.txt', output);
  } catch (err) {
    fs.writeFileSync('scripts/ANALYSIS_REAL.txt', 'ERROR: ' + err.message);
  } finally {
    await client.end();
  }
}
main();
