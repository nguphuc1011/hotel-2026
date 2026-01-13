const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error('Missing DATABASE_URL or DIRECT_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Checking V3 Columns ---');
    const settingsCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'settings'
    `);
    console.log('Settings columns:', settingsCols.rows.map(r => r.column_name));

    const roomCatCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'room_categories'
        AND column_name IN (
          'price_daily', 'price_hourly', 'price_next_hour', 'price_overnight', 
          'overnight_enabled', 'surcharge_mode', 'hourly_surcharge_amount', 
          'auto_surcharge_enabled', 'price_overnight_late_hour', 'price_overnight_enabled'
        )
    `);
    console.log('Room category columns:', roomCatCols.rows.map(r => r.column_name));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
  }
}

run();
