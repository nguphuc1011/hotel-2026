
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log('--- STARTING CUSTOMER BALANCE SYNC TEST (MANUAL SIMULATION) ---');

  // 1. Create a Test Customer
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .insert({ 
      full_name: 'Test Customer Sync V2', 
      phone: '0999888666',
      balance: 100000 // Start with some balance (Credit/Debt)
    })
    .select()
    .single();

  if (custError) {
    console.error('Error creating customer:', custError);
    return;
  }
  console.log(`1. Created Customer: ${customer.full_name} (ID: ${customer.id}) - Balance: ${customer.balance}`);

  // 2. Create a Cash Flow Transaction (Simulate "Thanh toán trả phòng")
  // Flow Type: IN (Customer pays us)
  // Amount: 500,000
  // This should normally REDUCE Customer Debt (Balance increases? Or Debt logic?)
  // System Logic: 
  // - Balance > 0 means Customer has Credit (Prepaid).
  // - Balance < 0 means Customer owes us (Debt).
  // If Customer pays 500k (IN), Balance should INCREASE (e.g., -500k -> 0).
  
  // Let's say current balance is -500,000 (Debt).
  await supabase.from('customers').update({ balance: -500000 }).eq('id', customer.id);
  console.log('   Set Customer Balance to -500,000 (Debt)');

  const { data: cf1, error: cfError } = await supabase
    .from('cash_flow')
    .insert({
      flow_type: 'IN',
      category: 'Thanh toán trả phòng',
      amount: 500000,
      description: 'Simulated Payment',
      customer_id: customer.id,
      payment_method_code: 'cash',
      created_by: 'c995de66-19a3-4504-98f9-c522b7291e22' // Random UUID or use auth.uid() if logged in
    })
    .select()
    .single();

  if (cfError) {
    console.error('Error creating cash flow:', cfError);
    return;
  }
  console.log(`2. Created Cash Flow (IN): 500,000. ID: ${cf1.id}`);
  
  // Simulate the effect of this payment: Balance increases by 500,000
  // -500,000 + 500,000 = 0
  await supabase.from('customers').update({ balance: 0 }).eq('id', customer.id);
  console.log('   Simulated Balance Update: 0 (Paid off debt)');

  // 3. DELETE (VOID) the Transaction
  // This should REVERSE the effect.
  // We are voiding the payment of 500,000.
  // Customer Balance should go DOWN by 500,000 (Back to -500,000).
  console.log('3. Deleting (Voiding) the Transaction...');
  const { data: delResult, error: delError } = await supabase.rpc('fn_delete_cash_flow', {
    p_id: cf1.id,
    p_reason: 'Testing Rollback V2'
  });

  if (delError) {
    console.error('Error deleting transaction:', delError);
    return;
  }
  console.log('   Delete Result:', delResult);

  // 4. Verify Final State
  // A. Customer Balance should be back to -500,000
  const { data: custFinal } = await supabase.from('customers').select('balance').eq('id', customer.id).single();
  console.log(`4. Final Customer Balance: ${custFinal.balance} (Expected: -500000)`);

  // B. Customer Transactions should have a Reversal record
  const { data: transLogs } = await supabase
    .from('customer_transactions')
    .select('*')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });
    
  console.log('5. Customer Transaction Logs:');
  transLogs.forEach(t => {
    console.log(`   - [${t.type}] Amount: ${t.amount}, Desc: ${t.description}, Bal After: ${t.balance_after}`);
  });
  
  // C. Cash Flow should have VOID record
  const { data: cfLogs } = await supabase
    .from('cash_flow')
    .select('*')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });
    
  console.log('6. Cash Flow Logs:');
  cfLogs.forEach(c => {
    console.log(`   - [${c.flow_type}] Amount: ${c.amount}, Desc: ${c.description}`);
  });

  // Cleanup
  console.log('--- CLEANUP ---');
  await supabase.from('customer_transactions').delete().eq('customer_id', customer.id);
  await supabase.from('cash_flow').delete().eq('customer_id', customer.id);
  await supabase.from('customers').delete().eq('id', customer.id);
  console.log('Cleaned up test data.');
}

runTest();
