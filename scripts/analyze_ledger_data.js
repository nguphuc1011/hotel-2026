const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- ANALYZING ACTUAL LEDGER DATA ---');
    
    // Get current hotel_id from a recent booking to test
    const hotelRes = await client.query("SELECT hotel_id FROM public.bookings ORDER BY created_at DESC LIMIT 1");
    if (hotelRes.rows.length === 0) {
        console.log('No bookings found to determine hotel_id');
        return;
    }
    const hotelId = hotelRes.rows[0].hotel_id;
    console.log(`Analyzing for Hotel ID: ${hotelId}`);

    const ledgerRes = await client.query(`
      WITH threshold AS (
        SELECT public.fn_get_current_night_audit_threshold($1) as val
      )
      SELECT l.id, l.booking_id, l.amount, l.description, l.event_type, l.created_at, r.room_number,
             (SELECT val FROM threshold) as audit_threshold
      FROM public.daily_expected_ledger l
      LEFT JOIN public.bookings b ON l.booking_id = b.id
      LEFT JOIN public.rooms r ON b.room_id = r.id
      WHERE l.hotel_id = $1 AND l.created_at >= (SELECT val FROM threshold)
      ORDER BY l.created_at ASC
    `, [hotelId]);
    
    if (ledgerRes.rows.length > 0) {
        console.log(`Night Audit Threshold used: ${ledgerRes.rows[0].audit_threshold}`);
    } else {
        console.log('No ledger entries found since the last Night Audit.');
    }

    console.log(`\nLedger entries since threshold (${ledgerRes.rows.length} entries):`);
    console.table(ledgerRes.rows.map(r => ({
        room: r.room_number || 'N/A',
        event: r.event_type,
        amount: Number(r.amount).toLocaleString(),
        desc: r.description,
        time: new Date(r.created_at).toLocaleTimeString('vi-VN')
    })));

    const totalRes = await client.query("SELECT public.fn_get_daily_expected_revenue($1) as total", [hotelId]);
    console.log(`\nFinal Calculated Total: ${Number(totalRes.rows[0].total).toLocaleString()}đ`);

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

run();
