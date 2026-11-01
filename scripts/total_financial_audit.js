const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function totalAudit() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const hotelRes = await client.query("SELECT hotel_id FROM public.settings WHERE key = 'config' LIMIT 1");
    if (hotelRes.rows.length === 0) return;
    const hotel_id = hotelRes.rows[0].hotel_id;

    console.log(`\n=== 🕵️ BÁO CÁO TỔNG KIỂM KÊ TÀI CHÍNH (HOTEL: ${hotel_id}) ===`);

    const wallets = await client.query("SELECT id, name, balance FROM public.wallets WHERE hotel_id = $1", [hotel_id]);
    
    for (const w of wallets.rows) {
      console.log(`\n--- KIỂM TRA VÍ: ${w.id} (${w.name}) ---`);
      console.log(`Số dư thực tế trong ví: ${Number(w.balance).toLocaleString()}đ`);

      let calcBalance = 0;
      let logicDesc = "";

      if (w.id === 'CASH' || w.id === 'BANK') {
        const res = await client.query(`
          SELECT SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) as sum
          FROM public.cash_flow 
          WHERE hotel_id = $1 AND payment_method_code = $2
        `, [hotel_id, w.id.toLowerCase()]);
        calcBalance = Number(res.rows[0].sum || 0);
        logicDesc = `Tổng dòng tiền mặt/ngân hàng từ lịch sử`;
      } 
      else if (w.id === 'RECEIVABLE') {
        // Only active rooms should have receivable
        const res = await client.query(`
          SELECT b.id, b.room_id, r.room_number
          FROM public.bookings b
          JOIN public.rooms r ON b.room_id = r.id
          WHERE b.hotel_id = $1 AND b.status = 'checked_in'
        `, [hotel_id]);
        
        for (const b of res.rows) {
          const billRes = await client.query("SELECT public.calculate_booking_bill($1) as bill", [b.id]);
          const bill = billRes.rows[0].bill;
          const paidRes = await client.query("SELECT SUM(amount) as paid FROM public.cash_flow WHERE ref_id = $1 AND category = 'Thanh toán' AND flow_type = 'IN'", [b.id]);
          calcBalance += (Number(bill.total_amount) - Number(bill.deposit_amount) - Number(paidRes.rows[0].paid || 0));
        }
        logicDesc = `Tổng nợ thực tế của các phòng đang ở`;
      }
      else if (w.id === 'REVENUE') {
        const res = await client.query(`
          SELECT SUM(amount) as sum FROM public.cash_flow 
          WHERE hotel_id = $1 AND flow_type = 'IN' AND payment_method_code = 'credit'
          AND category NOT IN ('Thanh toán', 'Tiền cọc', 'Chuyển cọc', 'Kết chuyển nợ')
        `, [hotel_id]);
        const inRevenue = Number(res.rows[0].sum || 0);
        
        const resOut = await client.query(`
          SELECT SUM(amount) as sum FROM public.cash_flow 
          WHERE hotel_id = $1 AND flow_type = 'OUT' AND category = 'Hoàn tiền hủy phòng'
        `, [hotel_id]);
        const outRevenue = Number(resOut.rows[0].sum || 0);
        
        calcBalance = inRevenue - outRevenue;
        logicDesc = `Tổng doanh thu (Accrual) trừ đi các khoản hủy/hoàn`;
      }

      console.log(`${logicDesc}: ${calcBalance.toLocaleString()}đ`);
      const diff = Number(w.balance) - calcBalance;
      if (Math.abs(diff) < 100) {
        console.log(`✅ TRẠNG THÁI: KHỚP`);
      } else {
        console.log(`❌ TRẠNG THÁI: SAI LỆCH (${diff.toLocaleString()}đ)`);
      }
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

totalAudit();
