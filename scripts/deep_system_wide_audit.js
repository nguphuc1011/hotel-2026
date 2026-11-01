const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('========================================================================');
  console.log('   DEEP SYSTEM-WIDE ASYMMETRY & INTEGRITY AUDIT (TOÀN BỘ HỆ THỐNG)');
  console.log('========================================================================\n');

  try {
    const hotels = await client.query('SELECT id, name, slug FROM public.hotels ORDER BY created_at');

    for (const h of hotels.rows) {
      const hId = h.id;
      console.log(`\n########################################################################`);
      console.log(`🏨 KIỂM TOÁN KHÁCH SẠN: ${h.name} (${h.slug}) [${hId}]`);
      console.log(`########################################################################`);

      // =====================================================================
      // 1. KIỂM TOÁN TÌNH TRẠNG PHÒNG VÀ BOOKING (ROOMS vs BOOKINGS ASYMMETRY)
      // =====================================================================
      console.log('\n--- 1. TÌNH TRẠNG PHÒNG & ĐƠN ĐẶT PHÒNG (ROOMS vs BOOKINGS) ---');
      
      // 1.1 Phòng có status = 'occupied' nhưng current_booking_id IS NULL
      const occNoBooking = await client.query(`
        SELECT id, room_number, status, current_booking_id 
        FROM public.rooms 
        WHERE hotel_id = $1 AND status = 'occupied' AND current_booking_id IS NULL
      `, [hId]);
      console.log(`1.1 Phòng 'occupied' nhưng thiếu current_booking_id: ${occNoBooking.rows.length === 0 ? '✅ 0 phòng (Hợp lệ)' : '❌ LỖI: ' + occNoBooking.rows.length + ' phòng'}`);
      if (occNoBooking.rows.length > 0) console.table(occNoBooking.rows);

      // 1.2 Phòng có current_booking_id trỏ tới booking đã hoàn thành hoặc hủy
      const roomOrphanBooking = await client.query(`
        SELECT r.id, r.room_number, r.status as room_status, b.id as booking_id, b.status as booking_status
        FROM public.rooms r
        JOIN public.bookings b ON r.current_booking_id = b.id
        WHERE r.hotel_id = $1 AND b.status != 'checked_in'
      `, [hId]);
      console.log(`1.2 Phòng trỏ tới booking KHÔNG PHẢI checked_in: ${roomOrphanBooking.rows.length === 0 ? '✅ 0 phòng (Hợp lệ)' : '❌ LỖI: ' + roomOrphanBooking.rows.length + ' phòng'}`);
      if (roomOrphanBooking.rows.length > 0) console.table(roomOrphanBooking.rows);

      // 1.3 Booking có status = 'checked_in' nhưng phòng lại KHÔNG PHẢI 'occupied' hoặc không trỏ tới booking đó
      const bookingOrphanRoom = await client.query(`
        SELECT b.id as booking_id, b.status as booking_status, r.id as room_id, r.room_number, r.status as room_status, r.current_booking_id
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.hotel_id = $1 AND b.status = 'checked_in' AND (r.status != 'occupied' OR r.current_booking_id != b.id)
      `, [hId]);
      console.log(`1.3 Booking 'checked_in' nhưng phòng không khớp status 'occupied': ${bookingOrphanRoom.rows.length === 0 ? '✅ 0 booking (Hợp lệ)' : '❌ LỖI: ' + bookingOrphanRoom.rows.length + ' đơn'}`);
      if (bookingOrphanRoom.rows.length > 0) console.table(bookingOrphanRoom.rows);

      // 1.4 Kiểm tra tính toán Bill của tất cả phòng đang có khách (Occupied Rooms Bill check)
      const occRooms = await client.query(`
        SELECT r.id as room_id, r.room_number, b.id as booking_id, b.rental_type, b.check_in_actual, b.deposit_amount, b.custom_price
        FROM public.rooms r
        JOIN public.bookings b ON r.current_booking_id = b.id
        WHERE r.hotel_id = $1 AND r.status = 'occupied'
      `, [hId]);
      console.log(`1.4 Kiểm tra tính bill cho ${occRooms.rows.length} phòng đang ở:`);
      for (const orm of occRooms.rows) {
        try {
          const bRes = await client.query('SELECT public.calculate_booking_bill($1) as bill', [orm.booking_id]);
          const bill = bRes.rows[0].bill;
          const hasError = !bill.success || bill.total_amount === undefined || isNaN(Number(bill.total_amount));
          console.log(`    * P.${orm.room_number}: Total=${bill.total_amount}, RoomCharge=${bill.room_charge}, Surcharge=${bill.surcharge_amount}, Deposit=${bill.deposit_amount}, ToPay=${bill.amount_to_pay} -> ${hasError ? '❌ LỖI TÍNH BILL' : '✅ Bill OK'}`);
        } catch (e) {
          console.log(`    * P.${orm.room_number}: ❌ LỖI CRITICAL: ${e.message}`);
        }
      }

      // =====================================================================
      // 2. KIỂM TOÁN DỊCH VỤ & KHO (SERVICES & INVENTORY INTEGRITY)
      // =====================================================================
      console.log('\n--- 2. KIỂM TOÁN DỊCH VỤ PHÒNG (BOOKING_SERVICES) ---');
      // 2.1 booking_services trỏ tới booking không tồn tại
      const orphanServices = await client.query(`
        SELECT bs.id, bs.booking_id, bs.service_id, bs.quantity
        FROM public.booking_services bs
        LEFT JOIN public.bookings b ON bs.booking_id = b.id
        WHERE b.id IS NULL
      `);
      console.log(`2.1 Dịch vụ mồ côi (booking không tồn tại): ${orphanServices.rows.length === 0 ? '✅ 0 bản ghi (Hợp lệ)' : '❌ LỖI: ' + orphanServices.rows.length + ' bản ghi'}`);

      // 2.2 booking_services có số lượng <= 0 hoặc giá âm
      const invalidServices = await client.query(`
        SELECT bs.id, bs.booking_id, bs.service_id, bs.quantity, bs.price_at_time
        FROM public.booking_services bs
        JOIN public.bookings b ON bs.booking_id = b.id
        WHERE b.hotel_id = $1 AND (bs.quantity <= 0 OR bs.price_at_time < 0)
      `, [hId]);
      console.log(`2.2 Dịch vụ số lượng <= 0 hoặc giá < 0: ${invalidServices.rows.length === 0 ? '✅ 0 bản ghi (Hợp lệ)' : '❌ LỖI: ' + invalidServices.rows.length + ' bản ghi'}`);

      // =====================================================================
      // 3. KIỂM TOÁN CÔNG NỢ KHÁCH HÀNG (CUSTOMERS vs CUSTOMER_TRANSACTIONS)
      // =====================================================================
      console.log('\n--- 3. ĐỐI SOÁT CÔNG NỢ KHÁCH HÀNG (CUSTOMERS vs TRANSACTIONS) ---');
      const allCusts = await client.query(`
        SELECT id, full_name, phone, balance
        FROM public.customers
        WHERE hotel_id = $1
      `, [hId]);
      
      let custMismatchCount = 0;
      for (const c of allCusts.rows) {
        // Tính tổng biến động từ customer_transactions
        const txSum = await client.query(`
          SELECT 
            COALESCE(SUM(CASE 
              WHEN type IN ('payment', 'adjustment') THEN amount 
              WHEN type IN ('charge', 'refund') THEN -amount 
              ELSE 0 END), 0) as calc_net
          FROM public.customer_transactions
          WHERE customer_id = $1
        `, [c.id]);
        
        const lastTx = await client.query(`
          SELECT balance_after 
          FROM public.customer_transactions 
          WHERE customer_id = $1 
          ORDER BY created_at DESC LIMIT 1
        `, [c.id]);

        const dbBal = Number(c.balance);
        if (lastTx.rows.length > 0) {
          const lastBalAfter = Number(lastTx.rows[0].balance_after);
          if (Math.abs(dbBal - lastBalAfter) > 1) {
            console.log(`❌ LỆCH: Khách ${c.full_name} (${c.id.substring(0,8)}): Số dư customers.balance = ${dbBal.toLocaleString()}đ, nhưng balance_after của GD gần nhất = ${lastBalAfter.toLocaleString()}đ`);
            custMismatchCount++;
          }
        } else if (dbBal !== 0) {
          console.log(`⚠️ KHÁCH CÓ SỐ DƯ NHƯNG 0 CÓ LỊCH SỬ GD: ${c.full_name} (${c.id.substring(0,8)}): balance = ${dbBal.toLocaleString()}đ`);
          custMismatchCount++;
        }
      }
      if (custMismatchCount === 0) {
        console.log(`✅ Toàn bộ ${allCusts.rows.length} khách hàng đều khớp số dư 100% với lịch sử giao dịch.`);
      }

      // =====================================================================
      // 4. KIỂM TOÁN CA LÀM VIỆC & TIỀN MẶT BÀN GIAO (SHIFTS AUDIT)
      // =====================================================================
      console.log('\n--- 4. KIỂM TOÁN CA LÀM VIỆC (SHIFTS & STAFF STATUS) ---');
      // 4.1 Kiểm tra nhân viên có current_shift_id có khớp với bảng shifts không
      const staffShiftCheck = await client.query(`
        SELECT st.id, st.full_name, st.current_shift_id, s.status as shift_status
        FROM public.staff st
        LEFT JOIN public.shifts s ON st.current_shift_id = s.id
        WHERE st.hotel_id = $1 AND st.current_shift_id IS NOT NULL
      `, [hId]);
      for (const st of staffShiftCheck.rows) {
        if (!st.shift_status || st.shift_status !== 'open') {
          console.log(`❌ LỆCH: Nhân viên ${st.full_name} đang giữ current_shift_id nhưng ca đó có status = '${st.shift_status}'`);
        }
      }
      if (staffShiftCheck.rows.length === 0) {
        console.log(`✅ Hiện tại không có nhân viên nào bị kẹt ca treo.`);
      }

      // 4.2 Kiểm tra ca đang mở (open shifts)
      const openShifts = await client.query(`
        SELECT s.id, st.full_name, s.initial_cash, s.start_time
        FROM public.shifts s
        JOIN public.staff st ON s.staff_id = st.id
        WHERE s.hotel_id = $1 AND s.status = 'open'
      `, [hId]);
      console.log(`4.2 Ca đang mở: ${openShifts.rows.length} ca`);
      if (openShifts.rows.length > 0) console.table(openShifts.rows);

      // =====================================================================
      // 5. KIỂM TOÁN BÁO CÁO & DOANH THU (REPORTS vs CASH FLOW vs LEDGER)
      // =====================================================================
      console.log('\n--- 5. KIỂM TOÁN BÁO CÁO DOANH THU & SỔ SÁCH ---');
      // Tổng tiền thu thực tế từ khách (SETTLEMENT) trong tháng này
      const settlementMonth = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total_collected
        FROM public.cash_flow
        WHERE hotel_id = $1 
          AND flow_type = 'IN' 
          AND (category IN ('Thanh toán', 'Tiền cọc', 'Thu trước', 'Thu nợ khách') OR payment_method_code IN ('cash', 'bank', 'transfer', 'qr'))
          AND occurred_at >= date_trunc('month', now())
      `, [hId]);
      console.log(`- Tổng tiền thực thu tháng này: ${Number(settlementMonth.rows[0].total_collected).toLocaleString()}đ`);

      // 6. KIỂM TOÁN CÀI ĐẶT BẢNG GIÁ (PRICING & CATEGORIES CONSISTENCY)
      console.log('\n--- 6. KIỂM TOÁN DANH MỤC PHÒNG & GIÁ (ROOM CATEGORIES) ---');
      const cats = await client.query(`
        SELECT id, name, price_hourly, price_daily, price_overnight
        FROM public.room_categories
        WHERE hotel_id = $1
      `, [hId]);
      console.table(cats.rows);
      const invalidCats = cats.rows.filter(c => Number(c.price_daily) <= 0 || Number(c.price_hourly) <= 0);
      if (invalidCats.length > 0) {
        console.log(`⚠️ Có ${invalidCats.length} loại phòng chưa cấu hình giá chuẩn.`);
      } else {
        console.log(`✅ Toàn bộ ${cats.rows.length} loại phòng đã cấu hình bảng giá hợp lệ.`);
      }

      // 7. KIỂM TOÁN CÁC PHÒNG CÓ LỖI DANH MỤC (ROOMS WITHOUT CATEGORY)
      const orphanCategoryRooms = await client.query(`
        SELECT r.id, r.room_number, r.category_id 
        FROM public.rooms r
        LEFT JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE r.hotel_id = $1 AND (rc.id IS NULL OR r.category_id IS NULL)
      `, [hId]);
      console.log(`- Phòng không có loại phòng (category_id NULL hoặc không hợp lệ): ${orphanCategoryRooms.rows.length === 0 ? '✅ 0 phòng' : '❌ LỖI: ' + orphanCategoryRooms.rows.length + ' phòng'}`);
      if (orphanCategoryRooms.rows.length > 0) console.table(orphanCategoryRooms.rows);
    }

  } catch (err) {
    console.error('Lỗi kiểm toán:', err);
  } finally {
    await client.end();
  }
}

main();
