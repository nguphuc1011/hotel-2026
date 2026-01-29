
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function simulateCheckIn() {
  await client.connect();
  try {
    console.log('--- BẮT ĐẦU MÔ PHỎNG CHECK-IN ĐỂ KIỂM TRA DÒNG TIỀN ---');

    // 1. Lấy số dư hiện tại
    const { rows: before } = await client.query('SELECT id, balance FROM public.wallets ORDER BY id');
    const walletsBefore = {};
    before.forEach(w => walletsBefore[w.id] = parseFloat(w.balance));
    
    console.log('Số dư trước khi Check-in:');
    console.table(walletsBefore);

    // 2. Tìm một phòng trống để test
    const { rows: rooms } = await client.query("SELECT id, room_number FROM public.rooms WHERE status = 'available' LIMIT 1");
    if (rooms.length === 0) {
        console.log('Không có phòng trống để test. Thử dùng phòng dirty...');
        const { rows: dirtyRooms } = await client.query("SELECT id, room_number FROM public.rooms WHERE status = 'dirty' LIMIT 1");
        if (dirtyRooms.length === 0) {
            console.error('Không tìm thấy phòng nào khả dụng để test.');
            return;
        }
        rooms.push(dirtyRooms[0]);
    }
    const testRoom = rooms[0];
    console.log(`Đang test với phòng: ${testRoom.room_number}`);

    // 3. Thực hiện Check-in (Phụ thu 100k, Giá phòng 170k -> Tổng 270k)
    // Chúng ta sẽ dùng hàm check_in_customer thực tế
    // Lưu ý: Ta giả định giá category của phòng này + surcharge = 270k 
    // Hoặc ta dùng custom_price = 270k để ép kết quả
    
    console.log('Gọi hàm check_in_customer với custom_price = 270000...');
    const checkInRes = await client.query(
        "SELECT public.check_in_customer($1, 'daily', NULL, 0, '[]'::jsonb, 'KHÁCH TEST LOGIC', 0, 0, 'Test logic dòng tiền', 270000)",
        [testRoom.id]
    );
    
    const bookingId = checkInRes.rows[0].check_in_customer.booking_id;
    console.log(`Check-in thành công. Booking ID: ${bookingId}`);

    // 4. Lấy số dư sau khi Check-in
    const { rows: after } = await client.query('SELECT id, balance FROM public.wallets ORDER BY id');
    const walletsAfter = {};
    after.forEach(w => walletsAfter[w.id] = parseFloat(w.balance));
    
    console.log('\nSố dư sau khi Check-in:');
    console.table(walletsAfter);

    console.log('\nBIẾN ĐỘNG DÒNG TIỀN:');
    Object.keys(walletsBefore).forEach(id => {
        const diff = walletsAfter[id] - walletsBefore[id];
        if (diff !== 0) {
            console.log(`- Ví ${id}: ${diff > 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN').format(diff)}đ`);
        }
    });

    // 5. Dọn dẹp dữ liệu test (ROLLBACK hoặc DELETE)
    // Vì đây là DB thật, tôi sẽ xóa dữ liệu vừa tạo để không làm sai lệch báo cáo của khách
    console.log('\n--- ĐANG DỌN DẸP DỮ LIỆU TEST ---');
    await client.query('DELETE FROM public.cash_flow WHERE ref_id = $1', [bookingId]);
    await client.query('DELETE FROM public.bookings WHERE id = $1', [bookingId]);
    await client.query('UPDATE public.rooms SET status = $1, current_booking_id = NULL WHERE id = $2', [testRoom.status || 'available', testRoom.id]);
    await client.query('DELETE FROM public.customers WHERE full_name = $1', ['KHÁCH TEST LOGIC']);
    
    // Khôi phục lại số dư ví (vì trigger đã chạy và update ví)
    for (const id of Object.keys(walletsBefore)) {
        await client.query('UPDATE public.wallets SET balance = $1 WHERE id = $2', [walletsBefore[id], id]);
    }
    console.log('Đã khôi phục trạng thái DB ban đầu.');

  } catch (err) {
    console.error('Lỗi trong quá trình test:', err);
  } finally {
    await client.end();
  }
}

simulateCheckIn();
