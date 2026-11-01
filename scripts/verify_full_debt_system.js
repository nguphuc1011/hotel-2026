const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const hotels = [
      { id: '33e31139-346d-4332-8b0f-5316019cba8c', name: 'Khách sạn mặc định (default)' },
      { id: 'f6020952-a268-4086-8f17-f65d27d5f042', name: 'Nhà nghỉ Cát Tường (ct)' }
    ];

    for (const h of hotels) {
      console.log(`\n===============================================================`);
      console.log(`🏨 ĐỐI SOÁT CÔNG NỢ CHI TIẾT: ${h.name}`);
      console.log(`===============================================================`);

      // 1. Sổ Khách hàng (Customers & Debtors)
      const debtorsRes = await client.query(`
        SELECT id, full_name, phone, balance
        FROM public.customers
        WHERE hotel_id = $1 AND balance < 0
      `, [h.id]);
      const totalDebtorDebt = debtorsRes.rows.reduce((sum, r) => sum + Math.abs(Number(r.balance)), 0);
      console.log(`1. Tổng nợ khách từ bảng customers (balance < 0): ${totalDebtorDebt.toLocaleString()}đ qua ${debtorsRes.rows.length} khách nợ`);
      if (debtorsRes.rows.length > 0) console.table(debtorsRes.rows);

      // 2. Lịch sử giao dịch khách nợ (Customer transactions audit)
      for (const d of debtorsRes.rows) {
        const txs = await client.query(`
          SELECT type, amount, balance_before, balance_after, description, created_at
          FROM public.customer_transactions
          WHERE customer_id = $1
          ORDER BY created_at DESC
          LIMIT 3
        `, [d.id]);
        console.log(`   * Giao dịch gần nhất của khách ${d.full_name}:`);
        console.table(txs.rows);
      }

      // 3. Công nợ tạm (Receivable từ phòng đang có khách ở)
      const occRes = await client.query(`
        SELECT b.id, r.room_number, b.rental_type, b.deposit_amount, b.check_in_actual
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.hotel_id = $1 AND b.status = 'checked_in'
      `, [h.id]);
      let totalReceivable = 0;
      for (const b of occRes.rows) {
        const bill = await client.query('SELECT public.calculate_booking_bill($1) as b', [b.id]);
        const res = bill.rows[0].b;
        const amountToPay = Number(res.amount_to_pay || 0);
        totalReceivable += amountToPay;
        console.log(`   * Phòng ${b.room_number}: Cần thanh toán = ${amountToPay.toLocaleString()}đ (Bill: ${Number(res.total_amount).toLocaleString()}đ, Cọc: ${Number(res.deposit_amount).toLocaleString()}đ)`);
      }
      console.log(`2. Tổng công nợ tạm (Khách đang ở): ${totalReceivable.toLocaleString()}đ qua ${occRes.rows.length} phòng`);

      // 4. Số dư ví lưu trong bảng wallets
      const walletsRes = await client.query(`
        SELECT id, name, balance
        FROM public.wallets
        WHERE hotel_id = $1 AND id IN ('DEBT', 'RECEIVABLE', 'CASH', 'BANK')
        ORDER BY id
      `, [h.id]);
      console.log(`\n3. Số dư trong bảng wallets:`);
      console.table(walletsRes.rows);

      // 5. Kết quả RPC fn_get_money_page_stats
      const statsRes = await client.query(`
        SELECT public.fn_get_money_page_stats($1, now() - interval '1 day', now()) as stats
      `, [h.id]);
      const s = statsRes.rows[0].stats;
      console.log(`4. Kết quả RPC fn_get_money_page_stats (Dữ liệu trả về cho Trang Quỹ tiền):`);
      console.log(`   - Công nợ khách (DEBT): Closing = ${Number(s.debt?.closing || 0).toLocaleString()}đ`);
      console.log(`   - Công nợ tạm (RECEIVABLE): Closing = ${Number(s.receivable?.closing || 0).toLocaleString()}đ`);
      console.log(`   - Tiền mặt (CASH): Closing = ${Number(s.cash?.closing || 0).toLocaleString()}đ`);
      console.log(`   - Ngân hàng (BANK): Closing = ${Number(s.bank?.closing || 0).toLocaleString()}đ`);

      // 6. Đánh giá tính nhất quán
      const isDebtMatch = Number(s.debt?.closing || 0) === totalDebtorDebt;
      const isRecMatch = Number(s.receivable?.closing || 0) === totalReceivable;
      console.log(`\n=> KẾT LUẬN ĐỐI SOÁT:`);
      console.log(`   - Công nợ khách: ${isDebtMatch ? '✅ KHỚP TUYỆT ĐỐI' : '❌ LỆCH'}`);
      console.log(`   - Công nợ tạm: ${isRecMatch ? '✅ KHỚP TUYỆT ĐỐI' : '❌ LỆCH'}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
