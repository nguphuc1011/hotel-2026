
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const bookingId = '927fb4e1-f4e0-4040-8144-edc11ff1a1aa';
  const customerId = '01175e2b-1241-4699-88f9-bbfe23c172d1';
  const staffId = '62de672f-07de-49c5-ae41-d79ec074d58d';

  console.log('--- BEFORE CHECKOUT ---');
  const { data: customerBefore } = await supabase.from('customers').select('balance').eq('id', customerId).single();
  if (!customerBefore) throw new Error('Customer not found');
  console.log('Customer Balance:', customerBefore.balance);

  console.log('\n--- CALLING handle_checkout ---');
  const { data, error: checkoutError } = await supabase.rpc('handle_checkout', {
    p_booking_id: bookingId,
    p_amount_paid: 0,
    p_payment_method: 'CASH',
    p_surcharge: 0,
    p_discount: 0,
    p_notes: 'AI Test Checkout',
    p_staff_id: staffId
  });

  if (checkoutError) {
    console.error('❌ Checkout Error:', checkoutError);
  } else {
    console.log('✅ Checkout Result:', data);
  }

  // Wait a bit for the trigger to process
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n--- AFTER CHECKOUT ---');
  const { data: customerAfter } = await supabase.from('customers').select('balance').eq('id', customerId).single();
  if (!customerAfter) throw new Error('Customer not found after checkout');
  console.log('Customer Balance:', customerAfter.balance);
  
  const expected = (customerBefore.balance || 0) - 170000;
  if (customerAfter.balance === expected) {
    console.log('\n✨ TEST PASSED: Debt recorded correctly (-300k - 170k = -470k)');
  } else {
    console.log('\n❌ TEST FAILED: Balance mismatch!');
    console.log(`Expected: ${expected}, Actual: ${customerAfter.balance}`);
  }
}

run().catch(console.error);
