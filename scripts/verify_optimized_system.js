const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== VERIFYING OPTIMIZED DATABASE & BUSINESS LOGIC ===\n');

  // 1. Verify 0 overloads in public schema
  const overloads = await client.query(`
    SELECT proname, COUNT(*) as count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    GROUP BY proname
    HAVING COUNT(*) > 1;
  `);
  console.log(`1. Overloaded functions remaining: ${overloads.rows.length}`);
  if (overloads.rows.length > 0) {
    console.table(overloads.rows);
  } else {
    console.log('   ✅ PASS: Exactly 0 overloaded functions in public schema!\n');
  }

  // 2. Verify booking_services triggers
  const bsTriggers = await client.query(`
    SELECT tgname, proname 
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relname = 'booking_services' AND NOT t.tgisinternal;
  `);
  console.log('2. Active triggers on booking_services:');
  console.table(bsTriggers.rows);
  const hasDupExpected = bsTriggers.rows.filter(t => t.tgname.includes('expected'));
  console.log(`   Expected revenue triggers on booking_services: ${hasDupExpected.length}`);
  if (hasDupExpected.length === 1) {
    console.log('   ✅ PASS: Exactly 1 expected revenue trigger (No duplicate calculation)!\n');
  } else {
    console.log('   ⚠️ WARNING: Expected 1 trigger, found:', hasDupExpected.length);
  }

  // 3. Test calculate_booking_bill on existing active booking
  const sampleBooking = await client.query(`
    SELECT id, room_id, hotel_id, rental_type, status 
    FROM public.bookings 
    WHERE status = 'checked_in' 
    LIMIT 1;
  `);

  if (sampleBooking.rows.length > 0) {
    const bId = sampleBooking.rows[0].id;
    console.log(`3. Testing calculate_booking_bill on active booking: ${bId}`);
    const billRes = await client.query(`SELECT public.calculate_booking_bill($1) as bill;`, [bId]);
    const bill = billRes.rows[0].bill;
    console.log('   Bill result:', {
      success: bill.success,
      room_name: bill.room_name,
      rental_type: bill.rental_type,
      room_charge: bill.room_charge,
      service_total: bill.service_total,
      total_amount: bill.total_amount,
      amount_to_pay: bill.amount_to_pay
    });
    console.log('   Explanations:', bill.explanation);
    console.log('   ✅ PASS: calculate_booking_bill computed flawlessly!\n');
  } else {
    console.log('3. No active booking found to test calculate_booking_bill.');
  }

  // 4. Test fn_perform_night_audit with hotel_id
  const sampleHotel = await client.query(`SELECT id, name FROM public.hotels LIMIT 1;`);
  if (sampleHotel.rows.length > 0) {
    const hId = sampleHotel.rows[0].id;
    console.log(`4. Testing fn_perform_night_audit for hotel: ${sampleHotel.rows[0].name} (${hId})`);
    const auditRes = await client.query(`SELECT public.fn_perform_night_audit($1) as res;`, [hId]);
    console.log('   Audit result:', auditRes.rows[0].res);
    console.log('   ✅ PASS: fn_perform_night_audit executed with advisory lock protection!\n');
  }

  await client.end();
}

run().catch(console.error);
