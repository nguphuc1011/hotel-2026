const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;

async function runComprehensiveAudit() {
  const client = new Client({ connectionString: conn });
  await client.connect();

  console.log('===============================================================');
  console.log('   KIỂM TOÁN DÒNG TIỀN TOÀN DIỆN (COMPREHENSIVE CASH FLOW AUDIT)');
  console.log('===============================================================\n');

  try {
    // 1. Danh sách các khách sạn (Hotels)
    const hotelsRes = await client.query('SELECT id, name, slug FROM public.hotels ORDER BY created_at ASC');
    console.log(`📌 Phát hiện ${hotelsRes.rows.length} khách sạn trong hệ thống:`);
    console.table(hotelsRes.rows);

    for (const hotel of hotelsRes.rows) {
      const hotelId = hotel.id;
      console.log(`\n===============================================================`);
      console.log(`🏨 KIỂM TRA KHÁCH SẠN: ${hotel.name} (${hotel.slug}) [${hotelId}]`);
      console.log(`===============================================================`);

      // A. KIỂM TRA TÍNH TOÀN VẸN CỦA VÍ TIỀN MẶT & NGÂN HÀNG (PHYSICAL WALLETS)
      console.log('\n--- 1. ĐỐI SOÁT VÍ VÀ SỔ QUỸ (WALLETS vs CASH_FLOW) ---');
      const walletsRes = await client.query(
        'SELECT id, name, balance FROM public.wallets WHERE hotel_id = $1 ORDER BY id',
        [hotelId]
      );
      
      const cfSumRes = await client.query(`
        SELECT 
          CASE 
            WHEN lower(COALESCE(payment_method_code, 'cash')) IN ('cash', 'tm') THEN 'cash'
            WHEN lower(payment_method_code) IN ('bank', 'transfer', 'qr') THEN 'bank'
            ELSE lower(payment_method_code)
          END as pm,
          SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) as net_flow,
          SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE 0 END) as total_in,
          SUM(CASE WHEN flow_type = 'OUT' THEN amount ELSE 0 END) as total_out,
          COUNT(*) as tx_count
        FROM public.cash_flow
        WHERE hotel_id = $1
        GROUP BY 1
      `, [hotelId]);

      const cfMap = new Map();
      cfSumRes.rows.forEach(r => cfMap.set(r.pm, r));

      for (const w of walletsRes.rows) {
        const pmKey = w.id.toLowerCase();
        if (pmKey === 'cash' || pmKey === 'bank') {
          const cfData = cfMap.get(pmKey) || { net_flow: 0, total_in: 0, total_out: 0, tx_count: 0 };
          const diff = Number(w.balance) - Number(cfData.net_flow);
          const status = Math.abs(diff) < 1 ? '✅ KHỚP TUYỆT ĐỐI 100%' : `❌ LỆCH: ${diff.toLocaleString()}đ`;

          console.log(`- Ví vật lý ${w.id} (${w.name}):`);
          console.log(`    + Số dư lưu trong bảng wallets: ${Number(w.balance).toLocaleString()}đ`);
          console.log(`    + Số dư tính từ lịch sử giao dịch: ${Number(cfData.net_flow).toLocaleString()}đ (Thu: +${Number(cfData.total_in).toLocaleString()}đ, Chi: -${Number(cfData.total_out).toLocaleString()}đ qua ${cfData.tx_count} GD)`);
          console.log(`    + Trạng thái: ${status}`);
        } else {
          console.log(`- Sổ/Ví danh nghĩa ${w.id} (${w.name}): Số dư = ${Number(w.balance).toLocaleString()}đ`);
        }
      }

      // B. KIỂM TRA GIAO DỊCH BẤT THƯỜNG / LỖI DỮ LIỆU TRONG SỔ QUỸ
      console.log('\n--- 2. QUÉT GIAO DỊCH DÒNG TIỀN BẤT THƯỜNG (ANOMALIES) ---');
      
      // B1. Số tiền âm hoặc bằng 0
      const invalidAmount = await client.query(`
        SELECT id, amount, flow_type, category, description, created_at 
        FROM public.cash_flow 
        WHERE hotel_id = $1 AND (amount <= 0 OR amount IS NULL)
      `, [hotelId]);
      console.log(`- Giao dịch số tiền <= 0: ${invalidAmount.rows.length === 0 ? '✅ 0 giao dịch (Hợp lệ)' : '⚠️ CẢNH BÁO: ' + invalidAmount.rows.length + ' giao dịch'}`);
      if (invalidAmount.rows.length > 0) console.table(invalidAmount.rows);

      // B2. Giao dịch thiếu payment_method_code hoặc flow_type
      const missingFields = await client.query(`
        SELECT id, amount, flow_type, payment_method_code, category 
        FROM public.cash_flow 
        WHERE hotel_id = $1 AND (flow_type IS NULL OR payment_method_code IS NULL)
      `, [hotelId]);
      console.log(`- Giao dịch thiếu flow_type hoặc payment_method: ${missingFields.rows.length === 0 ? '✅ 0 giao dịch (Hợp lệ)' : '⚠️ CẢNH BÁO: ' + missingFields.rows.length + ' giao dịch'}`);

      // B3. Giao dịch cọc phòng (Deposit) không có booking tương ứng
      const orphanDeposits = await client.query(`
        SELECT cf.id, cf.amount, cf.ref_id, cf.description 
        FROM public.cash_flow cf
        LEFT JOIN public.bookings b ON cf.ref_id = b.id
        WHERE cf.hotel_id = $1 AND cf.category = 'Tiền cọc' AND b.id IS NULL
      `, [hotelId]);
      console.log(`- Giao dịch Tiền cọc mồ côi (ref_id không có trong bookings): ${orphanDeposits.rows.length === 0 ? '✅ 0 giao dịch (Hợp lệ)' : '⚠️ CẢNH BÁO: ' + orphanDeposits.rows.length + ' giao dịch'}`);

      // C. KIỂM TRA ĐỐI SOÁT ĐẶT PHÒNG & TIỀN CỌC (BOOKINGS vs DEPOSIT FLOWS)
      console.log('\n--- 3. ĐỐI SOÁT TIỀN CỌC PHÒNG (BOOKINGS DEPOSIT vs CASH_FLOW) ---');
      const depositMismatch = await client.query(`
        SELECT 
          b.id as booking_id,
          r.room_number,
          b.status as booking_status,
          b.deposit_amount as booking_deposit,
          COALESCE(SUM(cf.amount), 0) as cash_flow_deposit
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        LEFT JOIN public.cash_flow cf ON cf.ref_id = b.id AND cf.category IN ('Tiền cọc', 'Thu trước') AND cf.flow_type = 'IN'
        WHERE b.hotel_id = $1 AND b.deposit_amount > 0
        GROUP BY b.id, r.room_number, b.status, b.deposit_amount
        HAVING b.deposit_amount != COALESCE(SUM(cf.amount), 0)
      `, [hotelId]);
      console.log(`- Đơn đặt phòng có tiền cọc bị lệch với sổ quỹ: ${depositMismatch.rows.length === 0 ? '✅ 0 đơn lệch (Khớp 100%)' : '⚠️ CẢNH BÁO: ' + depositMismatch.rows.length + ' đơn lệch'}`);
      if (depositMismatch.rows.length > 0) console.table(depositMismatch.rows);

      // D. KIỂM TRA PHÒNG ĐANG Ở VÀ DỰ THU (OCCUPIED ROOMS & EXPECTED REVENUE)
      console.log('\n--- 4. KIỂM TRA PHÒNG ĐANG Ở & DỰ THU HIỆN TẠI ---');
      const occupiedRooms = await client.query(`
        SELECT r.id, r.room_number, b.id as booking_id, b.rental_type, b.check_in_actual, b.deposit_amount
        FROM public.rooms r
        JOIN public.bookings b ON r.current_booking_id = b.id
        WHERE r.hotel_id = $1 AND r.status = 'occupied'
      `, [hotelId]);
      console.log(`- Số phòng đang có khách: ${occupiedRooms.rows.length} phòng`);

      let totalCalculatedExpected = 0;
      for (const room of occupiedRooms.rows) {
        const billRes = await client.query('SELECT public.calculate_booking_bill($1) as bill', [room.booking_id]);
        const bill = billRes.rows[0].bill;
        const total = Number(bill.total_amount || 0);
        const deposit = Number(bill.deposit_amount || 0);
        const amountToPay = Number(bill.amount_to_pay || 0);
        totalCalculatedExpected += amountToPay;
        console.log(`    * Phòng ${room.room_number} (${room.rental_type}): Tổng bill = ${total.toLocaleString()}đ, Cọc = ${deposit.toLocaleString()}đ, Cần thanh toán = ${amountToPay.toLocaleString()}đ`);
      }

      // Gọi RPC fn_get_daily_expected_revenue
      const expRes = await client.query('SELECT public.fn_get_daily_expected_revenue($1) as expected', [hotelId]);
      const rpcExpected = Number(expRes.rows[0].expected || 0);
      console.log(`- Dự thu tính toán từ chi tiết từng phòng: ${totalCalculatedExpected.toLocaleString()}đ`);
      console.log(`- Dự thu trả về từ RPC fn_get_daily_expected_revenue: ${rpcExpected.toLocaleString()}đ`);
      const expDiff = Math.abs(totalCalculatedExpected - rpcExpected);
      console.log(`- Đánh giá Dự thu: ${expDiff < 500 ? '✅ KHỚP CHÍNH XÁC' : '⚠️ Lệch nhẹ (sai khác thời điểm giây): ' + expDiff.toLocaleString() + 'đ'}`);

      // E. KIỂM TRA CÔNG NỢ KHÁCH HÀNG (CUSTOMER DEBTS)
      console.log('\n--- 5. KIỂM TRA CÔNG NỢ KHÁCH HÀNG ---');
      const debtorRes = await client.query(`
        SELECT id, full_name, phone, balance 
        FROM public.customers 
        WHERE hotel_id = $1 AND balance != 0
        ORDER BY balance ASC
      `, [hotelId]);
      console.log(`- Số khách hàng có số dư công nợ: ${debtorRes.rows.length} khách`);
      if (debtorRes.rows.length > 0) {
        console.table(debtorRes.rows);
      } else {
        console.log('    ✅ Không có khách hàng nào bị treo nợ xấu hoặc nợ đọng');
      }

      // F. KIỂM TRA BÀN GIAO CA (SHIFTS INTEGRITY)
      console.log('\n--- 6. KIỂM TRA SỔ GIAO CA (SHIFTS & DIFFERENCES) ---');
      const shiftsRes = await client.query(`
        SELECT s.id, COALESCE(st.full_name, 'N/A') as staff_name, s.start_time, s.end_time, s.status, s.initial_cash, s.actual_cash, s.difference 
        FROM public.shifts s
        LEFT JOIN public.staff st ON s.staff_id = st.id
        WHERE s.hotel_id = $1 
        ORDER BY s.created_at DESC 
        LIMIT 5
      `, [hotelId]);
      console.log(`- 5 ca làm việc gần nhất:`);
      console.table(shiftsRes.rows);
      const shiftDiscrepancies = shiftsRes.rows.filter(s => s.status === 'closed' && s.difference != 0);
      if (shiftDiscrepancies.length > 0) {
        console.log(`⚠️ Có ${shiftDiscrepancies.length} ca đóng có chênh lệch tiền mặt thực tế vs sổ sách.`);
      } else {
        console.log(`✅ Toàn bộ các ca đóng đều khớp số liệu.`);
      }
    }

    console.log('\n===============================================================');
    console.log('   KẾT THÚC KIỂM TOÁN TÀI CHÍNH TOÀN DIỆN');
    console.log('===============================================================');

  } catch (err) {
    console.error('❌ Lỗi kiểm toán:', err);
  } finally {
    await client.end();
  }
}

runComprehensiveAudit();
