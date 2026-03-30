const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const hotelId = 'f6020952-a268-4086-8f17-f65d27d5f042';
    
    console.log('--- Checking triggers on cash_flow ---');
    const trig = await client.query(
      'SELECT trigger_name, event_manipulation, action_statement FROM information_schema.triggers WHERE event_object_table = $1',
      ['cash_flow']
    );
    console.log(trig.rows);

    console.log('\n--- Checking recent cash_flow entries for ct ---');
    const cashFlow = await client.query(
        "SELECT * FROM cash_flow WHERE hotel_id = $1 AND category = 'Tiền phòng' AND payment_method_code = 'credit' ORDER BY occurred_at DESC LIMIT 5",
        [hotelId]
    );
    console.log(cashFlow.rows);

    console.log('\n--- Checking daily_expected_ledger for ANY entries for ct ---');
    const ledger = await client.query(
        "SELECT event_type, COUNT(*) FROM daily_expected_ledger WHERE hotel_id = $1 GROUP BY event_type",
        [hotelId]
    );
    console.log(ledger.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
