const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query("SELECT hotel_id FROM public.settings WHERE key = 'config' LIMIT 1");
    if (res.rows.length === 0) return;
    const h_id = res.rows[0].hotel_id;

    const tRes = await client.query("SELECT public.fn_get_current_night_audit_threshold($1) as t", [h_id]);
    const t = tRes.rows[0].t;
    console.log('THRESHOLD:', t);

    const lRes = await client.query(`
      SELECT l.amount, l.event_type, l.description, b.rental_type, r.room_number, l.created_at 
      FROM public.daily_expected_ledger l 
      LEFT JOIN public.bookings b ON l.booking_id = b.id 
      LEFT JOIN public.rooms r ON b.room_id = r.id 
      WHERE l.hotel_id = $1 AND l.created_at >= $2
      ORDER BY l.created_at ASC
    `, [h_id, t]);

    console.log('TOTAL_ENTRIES:', lRes.rows.length);
    let sum = 0;
    lRes.rows.forEach(r => {
      sum += Number(r.amount);
      console.log(`[${r.created_at.toISOString()}] ${r.event_type} | P.${r.room_number} (${r.rental_type}): ${Number(r.amount).toLocaleString()} - ${r.description}`);
    });
    console.log('---');
    console.log('CURRENT_SUM_IN_DB:', sum.toLocaleString());

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

check();
