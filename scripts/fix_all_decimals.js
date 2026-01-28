const { Client } = require('pg');

// Hardcode connection string from .env.local for reliability in this script
const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const client = new Client({
  connectionString: connectionString,
});

async function fixAllDecimals() {
  try {
    await client.connect();
    console.log('Connected to database...');

    // 1. Wallets
    console.log('Fixing wallets...');
    await client.query(`UPDATE wallets SET balance = ROUND(balance) WHERE balance != ROUND(balance)`);
    
    // 2. Cash Flow (amount only, no balance_after)
    console.log('Fixing cash_flow...');
    await client.query(`UPDATE cash_flow SET amount = ROUND(amount) WHERE amount != ROUND(amount)`);

    // 3. External Payables
    console.log('Fixing external_payables...');
    await client.query(`UPDATE external_payables SET amount = ROUND(amount) WHERE amount != ROUND(amount)`);

    // 4. Services
    console.log('Fixing services...');
    await client.query(`UPDATE services SET price = ROUND(price) WHERE price != ROUND(price)`);
    await client.query(`UPDATE services SET cost_price = ROUND(cost_price) WHERE cost_price != ROUND(cost_price)`);

    // 5. Room Categories
    console.log('Fixing room_categories...');
    await client.query(`UPDATE room_categories SET price_daily = ROUND(price_daily) WHERE price_daily != ROUND(price_daily)`);
    await client.query(`UPDATE room_categories SET price_hourly = ROUND(price_hourly) WHERE price_hourly != ROUND(price_hourly)`);
    await client.query(`UPDATE room_categories SET price_overnight = ROUND(price_overnight) WHERE price_overnight != ROUND(price_overnight)`);
    await client.query(`UPDATE room_categories SET price_next_hour = ROUND(price_next_hour) WHERE price_next_hour != ROUND(price_next_hour)`);
    await client.query(`UPDATE room_categories SET hourly_surcharge_amount = ROUND(hourly_surcharge_amount) WHERE hourly_surcharge_amount != ROUND(hourly_surcharge_amount)`);
    await client.query(`UPDATE room_categories SET price_extra_adult = ROUND(price_extra_adult) WHERE price_extra_adult != ROUND(price_extra_adult)`);
    await client.query(`UPDATE room_categories SET price_extra_child = ROUND(price_extra_child) WHERE price_extra_child != ROUND(price_extra_child)`);

    // 6. Booking Services
    console.log('Fixing booking_services...');
    await client.query(`UPDATE booking_services SET price_at_time = ROUND(price_at_time) WHERE price_at_time != ROUND(price_at_time)`);
    // total_price is generated, so no need to update
    await client.query(`UPDATE booking_services SET cost_price_at_time = ROUND(cost_price_at_time) WHERE cost_price_at_time != ROUND(cost_price_at_time)`);

    console.log('All decimals fixed successfully!');
  } catch (err) {
    console.error('Error fixing decimals:', err);
  } finally {
    await client.end();
  }
}

fixAllDecimals();
