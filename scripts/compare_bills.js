const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run(bookingId) {
  console.log('Comparing for booking:', bookingId);
  const v2 = await supabase.rpc('calculate_booking_bill_v2', { p_booking_id: bookingId });
  const v3 = await supabase.rpc('get_booking_bill_v3', { p_booking_id: bookingId });

  if (v2.error) console.error('v2 error:', v2.error.message);
  if (v3.error) console.error('v3 error:', v3.error.message);

  const d2 = v2.data || {};
  const d3 = v3.data || {};

  function pick(o, keys) {
    const out = {};
    for (const k of keys) out[k] = o[k];
    return out;
  }

  console.log('\nV2 summary:', pick(d2, [
    'total_amount','subtotal','room_charge','late_surcharge','service_fee_amount','vat_amount',
    'deposit','amount_to_pay','total_receivable'
  ]));
  console.log('V3 summary:', pick(d3, [
    'total_amount','room_charge','surcharge','service_total','deposit','final_payable','customer_debt_old'
  ]));

  // Coverage notes
  console.log('\nFields in V2:', Object.keys(d2).length);
  console.log('Fields in V3:', Object.keys(d3).length);
}

run('00000000-0000-0000-0000-000000000001').catch(e => console.error(e));
