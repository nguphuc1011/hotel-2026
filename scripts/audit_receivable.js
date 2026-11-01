const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function auditReceivable() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const hotelRes = await client.query("SELECT hotel_id FROM public.settings WHERE key = 'config' LIMIT 1");
    if (hotelRes.rows.length === 0) return;
    const hotel_id = hotelRes.rows[0].hotel_id;

    console.log(`--- AUDIT RECEIVABLE FOR HOTEL: ${hotel_id} ---`);

    // 1. Current Wallet Balance
    const wallet = await client.query("SELECT balance FROM public.wallets WHERE id = 'RECEIVABLE' AND hotel_id = $1", [hotel_id]);
    const currentBalance = Number(wallet.rows[0]?.balance || 0);
    console.log(`Current RECEIVABLE Wallet Balance: ${currentBalance.toLocaleString()}đ`);

    // 2. Sum of 'credit' transactions minus settlements in cash_flow
    // (This is what the trigger is supposed to do)
    const cfAudit = await client.query(`
      SELECT 
        SUM(CASE WHEN payment_method_code = 'credit' AND flow_type = 'IN' THEN amount ELSE 0 END) as total_credit_in,
        SUM(CASE WHEN payment_method_code = 'credit' AND flow_type = 'OUT' THEN amount ELSE 0 END) as total_credit_out,
        SUM(CASE WHEN (payment_method_code IN ('deposit_transfer', 'debt_transfer') OR category IN ('Thanh toán', 'Chuyển cọc', 'Kết chuyển nợ')) AND flow_type = 'IN' THEN amount ELSE 0 END) as total_settled_in,
        SUM(CASE WHEN (payment_method_code IN ('deposit_transfer', 'debt_transfer') OR category IN ('Thanh toán', 'Chuyển cọc', 'Kết chuyển nợ')) AND flow_type = 'OUT' THEN amount ELSE 0 END) as total_settled_out
      FROM public.cash_flow
      WHERE hotel_id = $1
    `, [hotel_id]);
    
    const row = cfAudit.rows[0];
    const calcBalance = (Number(row.total_credit_in) - Number(row.total_credit_out)) 
                      - (Number(row.total_settled_in) - Number(row.total_settled_out));
    
    console.log(`Calculated Balance from Cash Flow history: ${calcBalance.toLocaleString()}đ`);

    // 3. Live Outstanding from Active Bookings
    // We need to calculate the actual bill for each active booking
    const activeBookings = await client.query(`
      SELECT id, room_id, deposit_amount 
      FROM public.bookings 
      WHERE hotel_id = $1 AND status = 'checked_in'
    `, [hotel_id]);

    let totalLiveOutstanding = 0;
    console.log(`\nChecking ${activeBookings.rows.length} active bookings...`);

    for (const b of activeBookings.rows) {
      const billRes = await client.query("SELECT public.calculate_booking_bill($1) as bill", [b.id]);
      const bill = billRes.rows[0].bill;
      
      const totalAmount = Number(bill.total_amount || 0);
      const deposit = Number(bill.deposit_amount || 0);
      
      // Paid amount (excluding credit entries which are the 'receivable' itself)
      const paidRes = await client.query(`
        SELECT SUM(amount) as paid 
        FROM public.cash_flow 
        WHERE ref_id = $1 AND category = 'Thanh toán' AND flow_type = 'IN'
      `, [b.id]);
      const paid = Number(paidRes.rows[0].paid || 0);

      const outstanding = totalAmount - deposit - paid;
      totalLiveOutstanding += outstanding;
      
      // console.log(`- Booking ${b.id}: Total ${totalAmount.toLocaleString()}, Paid ${paid.toLocaleString()}, Outstanding ${outstanding.toLocaleString()}`);
    }

    console.log(`Total Live Outstanding (Unpaid) from all active rooms: ${totalLiveOutstanding.toLocaleString()}đ`);
    
    console.log('\n--- VERDICT ---');
    if (Math.abs(currentBalance - totalLiveOutstanding) < 1000) {
      console.log('✅ RECEIVABLE wallet matches live outstanding perfectly.');
    } else {
      console.log('❌ DISCREPANCY DETECTED!');
      console.log(`Difference: ${(currentBalance - totalLiveOutstanding).toLocaleString()}đ`);
      console.log('Possible reasons: Legacy data from old triggers, manual cash_flow entries, or cancelled bookings not fully reversed in wallet.');
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

auditReceivable();
