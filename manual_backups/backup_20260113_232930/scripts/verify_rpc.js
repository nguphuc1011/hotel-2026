
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('--- Starting Verification ---');

  // 1. Setup Settings (Flat)
  const settings = {
    // key: 'config', // Update existing config
    check_in_time: '14:00:00',
    check_out_time: '12:00:00',
    overnight_start_time: '22:00:00',
    overnight_end_time: '06:00:00',
    grace_minutes: 15,
    grace_in_enabled: true,
    grace_out_enabled: true,
    hourly_unit: 60,
    base_hourly_limit: 1,
    hourly_ceiling_enabled: true,
    vat_enabled: true,
    vat_percent: 10,
    service_fee_enabled: true,
    service_fee_percent: 5,
    surcharge_rules: [
      { type: 'Early', from_minute: 0, to_minute: 180, percentage: 30 }, // 0-3h
      { type: 'Early', from_minute: 180, to_minute: 360, percentage: 50 }, // 3-6h
      { type: 'Late', from_minute: 0, to_minute: 180, percentage: 30 }, // 0-3h (12:00-15:00)
      { type: 'Late', from_minute: 180, to_minute: 360, percentage: 50 } // 3-6h (15:00-18:00)
    ]
  };

  const { error: setErr } = await supabase.from('settings').update(settings).eq('key', 'config');
  if (setErr) console.error('Settings Error:', setErr);
  else console.log('1. Settings updated');

  // 2. Setup Room Category
  const catId = '00000000-0000-0000-0000-000000000001';
  const { error: catErr } = await supabase.from('room_categories').upsert({
    id: catId,
    name: 'Test Category',
    price_hourly: 100000,
    price_next_hour: 50000,
    price_daily: 500000,
    price_overnight: 300000,
    updated_at: new Date().toISOString()
  });
  if (catErr) console.error('Category Error:', catErr);
  else console.log('2. Category created');

  // 3. Setup Room
  const roomId = '00000000-0000-0000-0000-000000000001';
  const { error: roomErr } = await supabase.from('rooms').upsert({
    id: roomId,
    room_number: '101',
    category_id: catId,
    status: 'occupied'
  });
  if (roomErr) console.error('Room Error:', roomErr);
  else console.log('3. Room created');

  // 4. Setup Customer with DEBT
  const custId = '00000000-0000-0000-0000-000000000001';
  const { error: custErr } = await supabase.from('customers').upsert({
    id: custId,
    full_name: 'Nguyen Van A',
    balance: -200000 // Customer owes 200k
  });
  if (custErr) console.error('Customer Error:', custErr);
  else console.log('4. Customer created with -200k balance');

  // 5. Create Booking
  const bookingId = '00000000-0000-0000-0000-000000000001';
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() - 1);
  checkIn.setHours(14, 0, 0, 0);

  const checkOut = new Date();
  checkOut.setHours(16, 0, 0, 0); // 4 hours late from 12:00 -> 16:00

  const { error: bookErr } = await supabase.from('bookings').upsert({
    id: bookingId,
    room_id: roomId,
    customer_id: custId,
    check_in_actual: checkIn.toISOString(),
    check_out_actual: checkOut.toISOString(),
    rental_type: 'daily',
    status: 'checked_out',
    deposit_amount: 100000
  });
  if (bookErr) console.error('Booking Error:', bookErr);
  else console.log('5. Booking created');

  // 6. Call RPC
  const { data, error } = await supabase.rpc('calculate_booking_bill_v2', { 
    p_booking_id: bookingId 
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('\n--- RPC RESULT ---');
    console.log(JSON.stringify(data, null, 2));
    
    // Validation
    const roomCharge = 500000;
    const lateSurcharge = 250000; // 50% of 500k (Late rule 15:00-18:00 is 50%)
    const subtotal = roomCharge + lateSurcharge; // 750,000
    const serviceFee = subtotal * 0.05; // 37,500
    const vat = (subtotal + serviceFee) * 0.10; // 78,750
    const total = subtotal + serviceFee + vat; // 866,250
    const deposit = 100000;
    const debt = -200000; // Debt is -200k
    // Receivable = (Total - Deposit) - Debt = 766,250 - (-200,000) = 966,250.
    const receivable = (total - deposit) - debt; 
    
    console.log('\n--- EXPECTED ---');
    console.log('Total:', total);
    console.log('Receivable:', receivable);
    
    if (Math.abs(data.total_amount - total) < 1 && Math.abs(data.total_receivable - receivable) < 1) {
        console.log('\n✅ VERIFICATION PASSED');
    } else {
        console.log('\n❌ VERIFICATION FAILED');
    }
  }
}

verify();
