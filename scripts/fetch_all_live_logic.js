
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const fs = require('fs');

async function main() {
  await client.connect();
  try {
    const funcs = [
        'fn_apply_wallet_logic', 
        'trg_update_wallets', 
        'process_checkout', 
        'check_in_customer', 
        'calculate_booking_bill',
        'fn_calculate_room_charge'
    ];
    let output = '';
    
    console.log('--- Đang lấy định nghĩa hàm từ DB thật ---');
    for (const f of funcs) {
        const res = await client.query(`
            SELECT pg_get_functiondef(oid) as def
            FROM pg_proc
            WHERE proname = $1
            ORDER BY pronargs DESC -- Lấy bản có nhiều tham số nhất nếu trùng tên
            LIMIT 1
        `, [f]);
        
        if (res.rows.length > 0) {
            output += `\n--- ${f} ---\n`;
            output += res.rows[0].def + ';\n';
            console.log(`- Đã lấy: ${f}`);
        } else {
            output += `\n--- ${f} NOT FOUND ---\n`;
            console.log(`- KHÔNG TÌM THẤY: ${f}`);
        }
    }

    // Lấy thêm danh sách trigger trên bảng cash_flow
    const triggerRes = await client.query(`
        SELECT tgname as trigger_name, pg_get_triggerdef(oid) as definition
        FROM pg_trigger
        WHERE tgrelid = 'public.cash_flow'::regclass
        AND tgisinternal = false;
    `);
    
    output += '\n--- TRIGGERS ON cash_flow ---\n';
    triggerRes.rows.forEach(row => {
        output += `-- ${row.trigger_name}\n${row.definition};\n`;
    });

    fs.writeFileSync('LIVE_LOGIC_SUPABASE.sql', output);
    console.log('\n>>> ĐÃ LƯU TOÀN BỘ LOGIC THỰC TẾ VÀO LIVE_LOGIC_SUPABASE.sql');
  } catch (err) {
    console.error('Lỗi truy vấn:', err);
  } finally {
    await client.end();
  }
}

main();
