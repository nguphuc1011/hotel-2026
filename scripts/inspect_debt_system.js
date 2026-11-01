const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- 1. CASH FLOW WITH DEBT TRANSFER OR DEBT REPAYMENT ---');
    const cf = await client.query(`
      SELECT id, hotel_id, flow_type, category, amount, payment_method_code, description, created_at
      FROM public.cash_flow
      WHERE payment_method_code IN ('debt_transfer', 'credit') 
         OR category IN ('Kết chuyển nợ', 'Thu nợ khách', 'Thu nợ', 'Ghi nợ')
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.table(cf.rows);

    console.log('\n--- 2. ALL CUSTOMERS WITH BALANCE != 0 ---');
    const custs = await client.query(`
      SELECT id, full_name, phone, balance, hotel_id
      FROM public.customers
      WHERE balance != 0
    `);
    console.table(custs.rows);

    console.log('\n--- 3. WALLETS DEBT ROW ---');
    const wallets = await client.query(`
      SELECT id, name, balance, hotel_id
      FROM public.wallets
      WHERE id IN ('DEBT', 'RECEIVABLE')
    `);
    console.table(wallets.rows);

    console.log('\n--- 4. ACTIVE BOOKINGS VS RECEIVABLE ---');
    const occ = await client.query(`
      SELECT b.id, b.hotel_id, r.room_number, b.rental_type, b.deposit_amount, b.check_in_actual
      FROM public.bookings b
      JOIN public.rooms r ON b.room_id = r.id
      WHERE b.status = 'checked_in'
    `);
    console.table(occ.rows);

    for (const b of occ.rows) {
      const bill = await client.query('SELECT public.calculate_booking_bill($1) as b', [b.id]);
      const res = bill.rows[0].b;
      console.log(`P.${b.room_number} (${b.rental_type}) -> Total: ${res.total_amount}, Deposit: ${res.deposit_amount}, Need to pay: ${res.amount_to_pay}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
