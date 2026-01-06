
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Manually load env since we are running this script directly
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

async function checkDatabase() {
  console.log('--- Checking Database Status ---');
  console.log(`Connecting to: ${supabaseUrl}`);

  // 1. Check bookings table (selecting some basic columns)
  console.log('\n1. Checking bookings table schema...');
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('id, status, total_amount')
    .limit(1);

  if (bookingError) {
    console.error('❌ Error checking bookings table:', bookingError.message);
  } else {
    console.log('✅ Bookings table query successful. Data:', bookingData);
  }

  // 2. Check RPC function handle_check_in existence
  // We can't easily "list" functions via client, but we can try to call it with dummy data to see if it says "function not found"
  console.log('\n2. Verifying handle_check_in RPC existence...');
  // Intentionally missing params to force a validation error, NOT a "function not found" error
  const { error: rpcError } = await supabase.rpc('handle_check_in', {});

  if (rpcError) {
    if (rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
        console.error('❌ RPC handle_check_in NOT FOUND!');
    } else {
        console.log('✅ RPC handle_check_in exists (Error received as expected for empty params):', rpcError.message);
    }
  } else {
      console.log('✅ RPC handle_check_in exists (No error, which is unexpected for empty params but confirms existence)');
  }

    // 3. Check customer data for validation (User mentioned missing history)
    console.log('\n3. Checking Customer History Data...');
    const { data: customers, error: custError } = await supabase
        .from('customers')
        .select('id, full_name, visit_count, total_spent, last_visit_at')
        .order('last_visit_at', { ascending: false })
        .limit(3);
    
    if (custError) {
        console.error('❌ Error fetching customers:', custError.message);
    } else {
        console.log('✅ Recent Customers:', customers);
    }

    // 4. Check bookings history sorting
    if (customers && customers.length > 0) {
        const custId = customers[0].id;
        console.log(`\n4. Checking Bookings for customer ${customers[0].full_name} (${custId})...`);
        const { data: history, error: historyError } = await supabase
            .from('bookings')
            .select('id, check_in_at, status')
            .eq('customer_id', custId)
            .order('check_in_at', { ascending: false })
            .limit(3);
            
        if (historyError) {
            console.error('❌ Error fetching booking history:', historyError.message);
        } else {
            console.log('✅ Booking History (sorted by check_in_at):', history);
        }
    }
}

checkDatabase().catch(console.error);
