const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Simple date formatter
const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected. Starting Transaction (ROLLBACK mode)...');
    
    // START TRANSACTION
    await client.query('BEGIN');

    // 0. UPDATE LOGIC FUNCTIONS (To ensure we test the latest code)
    console.log('Applying latest billing_engine.sql logic...');
    const sqlPath = path.join(__dirname, '../src/lib/billing_engine.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sqlContent);
    console.log('Logic updated successfully within transaction.');

    // 1. SETUP TEMPORARY DATA
    // Create a Test Room Category
    const catRes = await client.query(`
      INSERT INTO room_categories (name, price_hourly, price_next_hour, price_daily, price_overnight, overnight_enabled)
      VALUES ('TEST_CAT_V3', 50000, 20000, 400000, 200000, true)
      RETURNING id
    `);
    const catId = catRes.rows[0].id;

    // Create a Test Room
    const roomRes = await client.query(`
      INSERT INTO rooms (room_number, category_id, status)
      VALUES ('TEST_999', $1, 'available')
      RETURNING id
    `, [catId]);
    const roomId = roomRes.rows[0].id;

    // Create a Test Customer
    const custRes = await client.query(`
      INSERT INTO customers (full_name) VALUES ('Test Customer') RETURNING id
    `);
    const custId = custRes.rows[0].id;

    // Update Settings (Remove WHERE key... to ensure we update the single row present)
    await client.query(`
      UPDATE public.settings 
      SET 
        check_in_time = '14:00:00',
        check_out_time = '12:00:00',
        overnight_start_time = '21:00:00',
        overnight_end_time = '08:00:00',
        overnight_checkout_time = '12:00:00',
        full_day_late_after = '18:00:00',
        
        grace_in_enabled = true,
        grace_out_enabled = true,
        grace_minutes = 15,
        
        hourly_unit = 60,
        base_hourly_limit = 1,
        hourly_ceiling_enabled = true,
        auto_surcharge_enabled = true,
        
        vat_percent = 0,
        service_fee_percent = 0,
        
        surcharge_rules = '{}'::jsonb
    `);

    // Fallback INSERT if not exists (though key='system_settings' should exist)
    // For simplicity in test script, we assume UPDATE worked if rows > 0.
    // If we were creating from scratch we would INSERT.

    console.log('Setup Complete. Running 10 Scenarios...\n');

    const runScenario = async (name, type, inTime, outTime, expected) => {
        const res = await client.query(`
            INSERT INTO bookings (room_id, customer_id, rental_type, check_in_actual, check_out_actual, status)
            VALUES ($1, $2, $3, $4, $5, 'completed')
            RETURNING id
        `, [roomId, custId, type, inTime, outTime]);
        const bookingId = res.rows[0].id;

        const billRes = await client.query(`SELECT calculate_booking_bill_v2($1)`, [bookingId]);
        const bill = billRes.rows[0].calculate_booking_bill_v2;
        
        console.log(`--- ${name} ---`);
        console.log(`Input: ${type} | In: ${formatDate(inTime)} | Out: ${formatDate(outTime)}`);
        console.log(`Duration: ${bill.duration_minutes} min`);
        console.log(`Explanation: ${bill.explanation || ''}`);
        
        const actual = parseInt(bill.final_amount);
        console.log(`Total: ${actual.toLocaleString()} VND (Expected: ~${expected.toLocaleString()} VND)`);
        
        const diff = Math.abs(actual - expected);
        const isCorrect = diff < 5000; // Allow small rounding diff
        console.log(`Status: ${isCorrect ? '✅ PASS' : '❌ FAIL'}`);
        if (!isCorrect) console.log(`Diff: ${diff}`);
        console.log('');
    };

    // Helper dates (Fixed reference date: 2024-01-01)
    const baseDate = '2024-01-01';
    
    // --- 3 NORMAL CASES ---
    
    // 1. Hourly Standard: 2 hours (50k + 20k = 70k)
    await runScenario('1. Normal - Hourly 2h', 'hourly', 
        `${baseDate} 10:00`, `${baseDate} 12:00`, 70000);

    // 2. Daily Standard: 14:00 -> 12:00 next day (400k)
    await runScenario('2. Normal - Daily Standard', 'daily', 
        `${baseDate} 14:00`, `2024-01-02 12:00`, 400000);

    // 3. Overnight Standard: 22:00 -> 08:00 next day (200k)
    // Settings: Overnight 21:00 - 08:00
    await runScenario('3. Normal - Overnight Standard', 'overnight', 
        `${baseDate} 22:00`, `2024-01-02 08:00`, 200000);


    // --- 5 SPECIAL CASES ---

    // 4. Hourly Grace Period: 1h 10m (Grace 15m). Should be 1h price = 50k
    await runScenario('4. Special - Hourly Grace (1h10m)', 'hourly', 
        `${baseDate} 10:00`, `${baseDate} 11:10`, 50000);

    // 5. Daily Early Check-in: 09:00 -> 12:00 (Checkin 14:00). Early 5h.
    // Fallback was 50% = 200k surcharge. Now 0 since no rules defined.
    await runScenario('5. Special - Daily Early Check-in (09:00)', 'daily', 
        `${baseDate} 09:00`, `2024-01-02 12:00`, 400000);

    // 6. Daily Late Check-out: 14:00 -> 16:00 (Checkout 12:00). Late 4h.
    // Fallback was 30% = 120k. Now 0 since no rules defined.
    await runScenario('6. Special - Daily Late Check-out (16:00)', 'daily', 
        `${baseDate} 14:00`, `2024-01-02 16:00`, 400000);

    // 7. Hourly Ceiling: 20 hours. 50 + 19*20 = 430k. Ceiling is 400k. Should be 400k.
    await runScenario('7. Special - Hourly Ceiling', 'hourly', 
        `${baseDate} 08:00`, `2024-01-02 04:00`, 400000);

    // 8. Overnight Late Checkout: 22:00 -> 13:00.
    // Overnight ends 12:00. 13:00 is 1h late.
    // Fallback was 30% of daily = 120k. Now 0.
    await runScenario('8. Special - Overnight Late', 'overnight', 
        `${baseDate} 22:00`, `2024-01-02 13:00`, 200000);


    // --- 2 RARE/EXTREME CASES ---

    // 9. Rare - Micro Stay: 1 minute usage. Should charge minimum 1 block (50k).
    await runScenario('9. Rare - Micro Stay (1 min)', 'hourly', 
        `${baseDate} 10:00`, `${baseDate} 10:01`, 50000);

    // 10. Rare - Cross Midnight Hourly: 23:30 -> 00:30. 1 hour. Should be 50k.
    await runScenario('10. Rare - Cross Midnight Hourly', 'hourly', 
        `${baseDate} 23:30`, `2024-01-02 00:30`, 50000);


    // FORCE ERROR TO ROLLBACK (Or just explicit rollback)
    throw new Error('TEST COMPLETED - ROLLING BACK');

  } catch (err) {
    if (err.message === 'TEST COMPLETED - ROLLING BACK') {
        console.log('\n✅ Testing finished successfully. Rolling back all changes.');
    } else {
        console.error('❌ Error:', err);
    }
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

main();