const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const hotels = ['33e31139-346d-4332-8b0f-5316019cba8c', 'f6020952-a268-4086-8f17-f65d27d5f042'];

    for (const hId of hotels) {
      console.log(`\n=================== HOTEL ${hId} ===================`);
      
      // CASH net
      const cashNet = await client.query(`
        SELECT SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) as net
        FROM public.cash_flow
        WHERE hotel_id = $1 AND lower(COALESCE(payment_method_code, 'cash')) IN ('cash', 'tm')
      `, [hId]);
      console.log('Calculated CASH Net:', cashNet.rows[0].net);

      // BANK net
      const bankNet = await client.query(`
        SELECT SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) as net
        FROM public.cash_flow
        WHERE hotel_id = $1 AND lower(payment_method_code) IN ('bank', 'transfer', 'qr')
      `, [hId]);
      console.log('Calculated BANK Net:', bankNet.rows[0].net);

      // Existing wallets
      const w = await client.query('SELECT id, balance FROM public.wallets WHERE hotel_id = $1 ORDER BY id', [hId]);
      console.table(w.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
