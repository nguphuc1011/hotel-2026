const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('====================================================');
  console.log('DEEP COMPREHENSIVE AUDIT: ALL UI & DB ASYMMETRIES');
  console.log('====================================================\n');

  // 1. CASH FLOW CATEGORIES AUDIT
  console.log('--- 1. CASH FLOW CATEGORIES AUDIT ---');
  const missingCategories = await client.query(`
    SELECT DISTINCT cf.hotel_id, cf.category, cf.flow_type, count(*), sum(cf.amount) as total
    FROM cash_flow cf
    LEFT JOIN cash_flow_categories cfc 
      ON cf.hotel_id = cfc.hotel_id AND cf.category = cfc.name
    WHERE cfc.id IS NULL
    GROUP BY cf.hotel_id, cf.category, cf.flow_type
  `);
  console.log('Categories present in cash_flow but NOT in cash_flow_categories:');
  console.table(missingCategories.rows);

  // 2. SHIFTS AUDIT
  console.log('\n--- 2. SHIFTS AUDIT ---');
  const shiftMismatches = await client.query(`
    SELECT id, hotel_id, status, staff_id, initial_cash, actual_cash, expected_cash, difference, start_time, end_time
    FROM shifts
    WHERE status = 'closed' AND (actual_cash IS NULL OR expected_cash IS NULL OR difference IS NULL)
  `);
  console.log('Closed shifts with NULL actual_cash / expected_cash / difference:');
  console.table(shiftMismatches.rows);

  const openShifts = await client.query(`
    SELECT id, hotel_id, status, staff_id, initial_cash, start_time
    FROM shifts
    WHERE status = 'active' OR status = 'open'
  `);
  console.log('Currently open/active shifts:');
  console.table(openShifts.rows);

  // 3. ROOMS & BOOKINGS INTEGRITY
  console.log('\n--- 3. ROOMS & BOOKINGS INTEGRITY ---');
  const roomIntegrity = await client.query(`
    SELECT r.id, r.room_number, r.status, r.current_booking_id, b.status as booking_status
    FROM rooms r
    LEFT JOIN bookings b ON r.current_booking_id = b.id
    WHERE (r.status = 'occupied' AND (r.current_booking_id IS NULL OR b.status != 'checked_in'))
       OR (r.status != 'occupied' AND r.current_booking_id IS NOT NULL)
  `);
  console.log('Rooms in invalid state:', roomIntegrity.rows);

  // 4. PRICE TIERS & ROOM CATEGORIES
  console.log('\n--- 4. PRICE TIERS & ROOM CATEGORIES INTEGRITY ---');
  const priceTiersAudit = await client.query(`
    SELECT rc.id, rc.name, rc.hotel_id, count(pt.id) as tier_count
    FROM room_categories rc
    LEFT JOIN price_tiers pt ON rc.id = pt.category_id
    GROUP BY rc.id, rc.name, rc.hotel_id
  `);
  console.log('Price tiers per room category:');
  console.table(priceTiersAudit.rows);

  // 5. FOLIO / BILLING CONSISTENCY
  console.log('\n--- 5. CHECKING CALCULATE_BOOKING_BILL ON ALL ACTIVE BOOKINGS ---');
  const activeBookings = await client.query(`
    SELECT b.id, b.hotel_id, r.room_number, b.customer_id, b.check_in_time, b.paid_amount
    FROM bookings b
    JOIN rooms r ON b.id = r.current_booking_id
    WHERE b.status = 'checked_in'
  `);
  for (const b of activeBookings.rows) {
    try {
      const res = await client.query('SELECT calculate_booking_bill($1) as bill', [b.id]);
      const bill = res.rows[0].bill;
      console.log(`Booking ${b.id} (P.${b.room_number}): Total=${bill.total_amount}, Paid=${bill.paid_amount}, ToPay=${bill.amount_to_pay}`);
    } catch (e) {
      console.error(`ERROR calculating bill for booking ${b.id}:`, e.message);
    }
  }

  // 6. WALLETS SYMMETRY
  console.log('\n--- 6. WALLETS SYMMETRY ---');
  const wallets = await client.query('SELECT hotel_id, wallet_type, balance FROM wallets ORDER BY hotel_id, wallet_type');
  console.table(wallets.rows);

  // Calculate actual cash / bank from cash_flow
  const cfBalances = await client.query(`
    SELECT hotel_id, 
           payment_method,
           SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) as net_flow
    FROM cash_flow
    WHERE hotel_id IS NOT NULL
    GROUP BY hotel_id, payment_method
  `);
  console.log('Net cash flow by payment method:');
  console.table(cfBalances.rows);

  await client.end();
}

run().catch(console.error);
