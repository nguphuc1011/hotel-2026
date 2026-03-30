const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- AUDITING HOURLY BOOKINGS LEDGER ---');
    
    // Tìm các booking phòng giờ đã completed trong hôm nay
    const hourlyBookings = await client.query(`
      SELECT b.id, b.room_id, r.room_number, b.status, b.rental_type, b.check_in_actual, b.check_out_actual
      FROM public.bookings b
      JOIN public.rooms r ON b.room_id = r.id
      WHERE b.rental_type = 'hourly' AND b.status = 'completed'
      AND b.check_out_actual >= public.fn_get_current_night_audit_threshold(b.hotel_id)
      LIMIT 5;
    `);

    for (const b of hourlyBookings.rows) {
      console.log(`\nBooking ID: ${b.id} (P.${b.room_number})`);
      
      const ledger = await client.query(`
        SELECT event_type, amount, description, created_at 
        FROM public.daily_expected_ledger 
        WHERE booking_id = $1 
        ORDER BY created_at ASC;
      `, [b.id]);
      
      console.log('Ledger entries:');
      console.table(ledger.rows.map(l => ({
        ...l,
        amount: Number(l.amount).toLocaleString()
      })));

      const bill = await client.query(`SELECT public.calculate_booking_bill($1, $2) as data`, [b.id, b.check_out_actual]);
      const billData = bill.rows[0].data;
      console.log(`Final Bill Total: ${Number(billData.total_amount).toLocaleString()}`);
      console.log(`Deposit: ${Number(billData.deposit_amount).toLocaleString()}`);
      console.log(`Expected Net (Bill - Deposit): ${Number(billData.total_amount - billData.deposit_amount).toLocaleString()}`);
      
      const totalLedger = ledger.rows.reduce((sum, l) => sum + Number(l.amount), 0);
      console.log(`Total in Ledger: ${totalLedger.toLocaleString()}`);
      console.log(`Difference: ${(totalLedger - (billData.total_amount - billData.deposit_amount)).toLocaleString()}`);
    }

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

run();
