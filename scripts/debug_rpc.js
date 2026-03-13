const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected.');

  try {
    // 1. Get a test booking
    const res = await client.query(`
      SELECT b.id, b.customer_id, b.deposit_amount, b.hotel_id, r.room_number
      FROM public.bookings b
      JOIN public.rooms r ON b.room_id = r.id
      WHERE b.status = 'checked_in'
      LIMIT 1
    `);

    if (res.rows.length === 0) {
      console.log('No checked-in bookings found.');
      return;
    }

    const b = res.rows[0];
    console.log('Test Booking:', b);

    // 2. Call adjust_customer_balance for deposit
    console.log('Calling adjust_customer_balance with deposit...');
    const rpcRes = await client.query(`
      SELECT public.adjust_customer_balance(
        $1, -- p_customer_id
        1000, -- p_amount
        'deposit', -- p_type
        'Test Deposit from Script', -- p_description
        $2 -- p_booking_id
      )
    `, [b.customer_id, b.id]);

    console.log('RPC Result:', JSON.stringify(rpcRes.rows[0].adjust_customer_balance, null, 2));
    const walletChanges = rpcRes.rows[0].adjust_customer_balance.wallet_changes;
    if (walletChanges && walletChanges.length > 0) {
      console.log('Verified Wallet Changes Structure:', walletChanges[0]);
      if (walletChanges[0].walletName && walletChanges[0].diff !== undefined) {
        console.log('Structure is CORRECT.');
      } else {
        console.log('Structure is still INCORRECT.');
      }
    }

    // 3. Verify changes
    const verifyRes = await client.query(`
      SELECT deposit_amount FROM public.bookings WHERE id = $1
    `, [b.id]);
    console.log('Verified deposit_amount:', verifyRes.rows[0].deposit_amount);

    const txRes = await client.query(`
      SELECT id, hotel_id, description FROM public.customer_transactions 
      WHERE booking_id = $1 AND type = 'deposit'
      ORDER BY created_at DESC LIMIT 1
    `, [b.id]);
    console.log('Verified transaction:', txRes.rows[0]);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
