const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function findGhostDebt() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const hotelRes = await client.query("SELECT hotel_id FROM public.settings WHERE key = 'config' LIMIT 1");
    if (hotelRes.rows.length === 0) return;
    const hotel_id = hotelRes.rows[0].hotel_id;

    console.log(`--- FINDING GHOST DEBT (RECEIVABLE) ---`);

    // Find bookings that are NOT 'checked_in' but still have an imbalance in cash_flow 'credit' vs 'settlement'
    const ghostRes = await client.query(`
      WITH booking_balances AS (
        SELECT 
          ref_id as booking_id,
          SUM(CASE WHEN payment_method_code = 'credit' AND flow_type = 'IN' THEN amount ELSE 0 END) -
          SUM(CASE WHEN payment_method_code = 'credit' AND flow_type = 'OUT' THEN amount ELSE 0 END) as total_accrued,
          
          SUM(CASE WHEN (payment_method_code IN ('deposit_transfer', 'debt_transfer') OR category IN ('Thanh toán', 'Chuyển cọc', 'Kết chuyển nợ')) AND flow_type = 'IN' THEN amount ELSE 0 END) -
          SUM(CASE WHEN (payment_method_code IN ('deposit_transfer', 'debt_transfer') OR category IN ('Thanh toán', 'Chuyển cọc', 'Kết chuyển nợ')) AND flow_type = 'OUT' THEN amount ELSE 0 END) as total_settled
        FROM public.cash_flow
        WHERE hotel_id = $1 AND ref_id IS NOT NULL
        GROUP BY ref_id
      )
      SELECT 
        bb.booking_id, 
        b.status, 
        b.check_out_actual,
        bb.total_accrued, 
        bb.total_settled,
        (bb.total_accrued - bb.total_settled) as balance
      FROM booking_balances bb
      JOIN public.bookings b ON bb.booking_id = b.id
      WHERE ABS(bb.total_accrued - bb.total_settled) > 10
      ORDER BY b.status, b.check_out_actual DESC
    `, [hotel_id]);

    console.log(`Found ${ghostRes.rows.length} bookings with non-zero receivable balance:`);
    console.table(ghostRes.rows.map(r => ({
      ID: r.booking_id.substring(0,8),
      Status: r.status,
      Accrued: Number(r.total_accrued).toLocaleString(),
      Settled: Number(r.total_settled).toLocaleString(),
      Balance: Number(r.balance).toLocaleString()
    })));

    const totalGhostBalance = ghostRes.rows.reduce((sum, r) => sum + Number(r.balance), 0);
    console.log(`\nTotal Calculated Receivable from ALL bookings: ${totalGhostBalance.toLocaleString()}đ`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

findGhostDebt();
