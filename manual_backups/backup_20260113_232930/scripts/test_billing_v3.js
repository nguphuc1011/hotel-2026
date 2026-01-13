const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Get Room & Category
    const resRoom = await client.query("SELECT id, category_id FROM rooms LIMIT 1");
    if (resRoom.rows.length === 0) throw new Error('No rooms found');
    const roomId = resRoom.rows[0].id;
    const catId = resRoom.rows[0].category_id;

    // 2. Setup Prices & Settings for Test
    // Update Category Prices
    await client.query(`
        UPDATE room_categories
        SET price_daily = 500000, 
            price_extra_adult = 50000, 
            price_extra_child = 30000,
            auto_surcharge_enabled = true
        WHERE id = $1
    `, [catId]);

    // Update System Settings (Ensure Late Rules exist)
    // Late Rule: 12:00-15:00 -> 30%
    const surchargeRules = {
        late_rules: [
            { from: "12:00", to: "15:00", percent: 30 },
            { from: "15:00", to: "18:00", percent: 50 }
        ],
        early_rules: [
            { from: "05:00", to: "09:00", percent: 50 },
            { from: "09:00", to: "14:00", percent: 30 }
        ]
    };

    await client.query(`
        UPDATE settings 
        SET 
            check_in_time = '14:00:00',
            check_out_time = '12:00:00',
            overnight_checkout_time = '12:00:00',
            grace_minutes = 10,
            grace_out_enabled = true,
            extra_person_enabled = true,
            surcharge_rules = $1::jsonb
        WHERE key = 'config'
    `, [JSON.stringify(surchargeRules)]);

    // 3. Create Customer
    const resCust = await client.query("INSERT INTO customers (full_name) VALUES ('Test Billing V3') RETURNING id");
    const custId = resCust.rows[0].id;

    // --- TEST 1: MANUAL EXTRA PERSON ---
    console.log('\n--- TEST 1: MANUAL EXTRA PERSON ---');
    // Create booking with extra_adults = 2
    const res1 = await client.query(`
        INSERT INTO bookings (room_id, customer_id, rental_type, check_in_actual, check_out_actual, status, extra_adults, extra_children)
        VALUES ($1, $2, 'daily', NOW(), NOW(), 'checked_out', 2, 1)
        RETURNING id
    `, [roomId, custId]);
    const bId1 = res1.rows[0].id;

    const bill1 = await client.query("SELECT get_booking_bill_v3($1) as bill", [bId1]);
    const d1 = bill1.rows[0].bill;
    
    console.log('Extra Adults (2 * 50k):', d1.extra_person);
    console.log('Explanation:', d1.extra_person_explanation);

    if (Number(d1.extra_person) === 130000) { // 2*50 + 1*30
        console.log('✅ PASS: Extra person calculated correctly based on manual input.');
    } else {
        console.error('❌ FAIL: Expected 130000, got', d1.extra_person);
    }

    // --- TEST 2: DYNAMIC LATE SURCHARGE ---
    console.log('\n--- TEST 2: DYNAMIC LATE SURCHARGE ---');
    // Standard Checkout: 12:00.
    // Actual Checkout: 13:30 (Late 1.5h).
    // Rule: 12:00-15:00 -> 30%.
    // Price Daily: 500,000 -> Surcharge: 150,000.
    
    // Construct timestamps
    const todayStr = new Date().toISOString().split('T')[0];
    const checkInTime = `${todayStr} 14:00:00`;
    const checkOutTime = `${todayStr} 13:30:00`; // Late 1.5h relative to 12:00
    
    const res2 = await client.query(`
        INSERT INTO bookings (room_id, customer_id, rental_type, check_in_actual, check_out_actual, status)
        VALUES ($1, $2, 'daily', $3, $4, 'checked_out')
        RETURNING id
    `, [roomId, custId, checkInTime, checkOutTime]);
    const bId2 = res2.rows[0].id;

    const bill2 = await client.query("SELECT get_booking_bill_v3($1) as bill", [bId2]);
    const d2 = bill2.rows[0].bill;

    console.log('Check Out Actual:', d2.check_out);
    console.log('Surcharge Amount:', d2.surcharge);
    console.log('Explanation:', d2.surcharge_explanation);

    // Expected: 500,000 * 30% = 150,000
    if (Number(d2.surcharge) === 150000) {
        console.log('✅ PASS: Late surcharge matches 30% rule.');
    } else {
        console.error('❌ FAIL: Expected 150000, got', d2.surcharge);
    }

    // --- TEST 3: VERY LATE SURCHARGE (Next Rule) ---
    console.log('\n--- TEST 3: VERY LATE SURCHARGE (Next Rule) ---');
    // Checkout: 16:00 (Late 4h). Rule: 15:00-18:00 -> 50%.
    const checkOutTime3 = `${todayStr} 16:00:00`;
    
    const res3 = await client.query(`
        INSERT INTO bookings (room_id, customer_id, rental_type, check_in_actual, check_out_actual, status)
        VALUES ($1, $2, 'daily', $3, $4, 'checked_out')
        RETURNING id
    `, [roomId, custId, checkInTime, checkOutTime3]);
    const bId3 = res3.rows[0].id;

    const bill3 = await client.query("SELECT get_booking_bill_v3($1) as bill", [bId3]);
    const d3 = bill3.rows[0].bill;

    console.log('Check Out Actual:', d3.check_out);
    console.log('Surcharge Amount:', d3.surcharge);
    
    // Expected: 500,000 * 50% = 250,000
    if (Number(d3.surcharge) === 250000) {
        console.log('✅ PASS: Very late surcharge matches 50% rule.');
    } else {
        console.error('❌ FAIL: Expected 250000, got', d3.surcharge);
    }

    // --- TEST 4: HOURLY BOOKING (NO SURCHARGE) ---
    console.log('\n--- TEST 4: HOURLY BOOKING (NO SURCHARGE) ---');
    // Check-in: 14:00, Check-out: 16:00 (2 hours)
    // Even if check-out is "late" compared to standard 12:00, hourly rental should ignore this.
    
    const res4 = await client.query(`
        INSERT INTO bookings (room_id, customer_id, rental_type, check_in_actual, check_out_actual, status)
        VALUES ($1, $2, 'hourly', $3, $4, 'checked_out')
        RETURNING id
    `, [roomId, custId, checkInTime, '2026-01-12 16:00:00']);
    const bId4 = res4.rows[0].id;

    const bill4 = await client.query("SELECT get_booking_bill_v3($1) as bill", [bId4]);
    const d4 = bill4.rows[0].bill;

    console.log('Rental Type:', 'hourly');
    console.log('Surcharge Amount:', d4.surcharge);
    console.log('Explanation:', d4.surcharge_explanation);

    if (Number(d4.surcharge) === 0) {
        console.log('✅ PASS: Hourly booking has NO early/late surcharge.');
    } else {
        console.error('❌ FAIL: Expected 0 surcharge for hourly, got', d4.surcharge);
    }

    // Cleanup
    await client.query("DELETE FROM bookings WHERE id IN ($1, $2, $3, $4)", [bId1, bId2, bId3, bId4]);
    await client.query("DELETE FROM customers WHERE id = $1", [custId]);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
