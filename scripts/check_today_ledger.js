const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const hotelId = '33e31139-346d-4332-8b0f-5316019cba8c';
    const threshRes = await client.query('SELECT public.fn_get_current_night_audit_threshold($1) as th', [hotelId]);
    const th = threshRes.rows[0].th;
    console.log('Threshold for today is:', th);

    const ledgerRes = await client.query(`
      SELECT id, booking_id, amount, description, event_type, created_at
      FROM public.daily_expected_ledger
      WHERE hotel_id = $1 AND created_at >= $2
      ORDER BY created_at ASC
    `, [hotelId, th]);

    console.log(`Found ${ledgerRes.rows.length} ledger entries today:`);
    console.table(ledgerRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
