const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- RECENT DEPOSIT ATTEMPTS ---');
    const txRes = await client.query(`
      SELECT id, customer_id, type, amount, balance_before, balance_after, description, booking_id, created_at
      FROM public.customer_transactions
      WHERE type = 'deposit' OR description ILIKE '%cọc%' OR description ILIKE '%deposit%'
      ORDER BY created_at DESC LIMIT 5
    `);
    let output = '--- RECENT DEPOSIT ATTEMPTS ---\n' + JSON.stringify(txRes.rows, null, 2);
    output += '\n\n--- CASH FLOW FOR DEPOSITS ---\n' + JSON.stringify(cfRes.rows, null, 2);
    output += '\n\n--- BOOKINGS DEPOSIT CHECK ---\n' + JSON.stringify(bkRes.rows, null, 2);
    output += '\n\n--- RLS STATUS ---\n' + JSON.stringify(rlsRes.rows, null, 2);
    
    fs.writeFileSync('c:/1hotel2/DB_INSPECTION_REPORT.txt', output);
    console.log('Report saved to DB_INSPECTION_REPORT.txt');

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
