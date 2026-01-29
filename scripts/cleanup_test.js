
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function cleanup() {
  await client.connect();
  try {
    const { rows } = await client.query("SELECT id, room_id FROM public.bookings WHERE notes = 'Test logic dòng tiền' ORDER BY created_at DESC LIMIT 1");
    if (rows.length > 0) {
        const b = rows[0];
        await client.query('UPDATE public.rooms SET current_booking_id = NULL, status = \'available\' WHERE id = $1', [b.room_id]);
        await client.query('DELETE FROM public.cash_flow WHERE ref_id = $1', [b.id]);
        await client.query('DELETE FROM public.bookings WHERE id = $1', [b.id]);
        await client.query('DELETE FROM public.customers WHERE full_name = \'KHÁCH TEST LOGIC\'');
        console.log('Đã dọn dẹp triệt để dữ liệu test.');
    }
    
    // Khôi phục ví về số dư chuẩn trước test
    await client.query('UPDATE public.wallets SET balance = 11485000 WHERE id = \'CASH\'');
    await client.query('UPDATE public.wallets SET balance = 2575000 WHERE id = \'BANK\'');
    await client.query('UPDATE public.wallets SET balance = 970000 WHERE id = \'ESCROW\'');
    await client.query('UPDATE public.wallets SET balance = 3600000 WHERE id = \'RECEIVABLE\'');
    await client.query('UPDATE public.wallets SET balance = 16895000 WHERE id = \'REVENUE\'');
    console.log('Đã khôi phục số dư ví.');
  } catch (err) {
    console.error('Lỗi dọn dẹp:', err);
  } finally {
    await client.end();
  }
}

cleanup();
