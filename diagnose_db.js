const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
let DATABASE_URL;

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL=(.*)/);
  if (match) {
      DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
  } else {
      const match2 = envContent.match(/POSTGRES_URL=(.*)/);
      if (match2) DATABASE_URL = match2[1].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.error('Error reading .env.local:', e);
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    
    console.log('\n=== DIAGNOSTIC REPORT ===\n');

    // 1. Check bookings table columns
    const bookingCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bookings'
      ORDER BY column_name;
    `);
    const cols = bookingCols.rows.map(r => r.column_name);
    console.log('Bookings Columns:', cols.includes('deposit_amount') ? 'OK (deposit_amount exists)' : 'MISSING deposit_amount');
    if (!cols.includes('deposit_amount')) {
        console.log('All columns:', cols.join(', '));
    }

    // 2. Check adjust_customer_balance definition
    console.log('\n--- Function Definition: adjust_customer_balance ---');
    const funcDef = await client.query(`
      SELECT pg_get_functiondef(oid) as def
      FROM pg_proc 
      WHERE proname = 'adjust_customer_balance';
    `);
    
    if (funcDef.rows.length > 0) {
        const def = funcDef.rows[0].def;
        console.log('Function exists.');
        console.log('Contains "deposit_amount"?', def.includes('deposit_amount'));
        console.log('Contains "cash_flow"?', def.includes('cash_flow'));
        console.log('Contains "payment_method"?', def.includes('payment_method'));
        console.log('Contains "p_type = \'deposit\'"?', def.includes("p_type = 'deposit'"));
        // Print first 500 chars to verify signature
        console.log('Signature preview:', def.substring(0, 300));
    } else {
        console.log('Function adjust_customer_balance NOT FOUND!');
    }

    // 3. Check Recent Data
    console.log('\n--- Recent Bookings (Top 3) ---');
    try {
        const bookings = await client.query(`
            SELECT id, customer_id, deposit_amount, created_at 
            FROM bookings 
            ORDER BY created_at DESC 
            LIMIT 3;
        `);
        console.table(bookings.rows);
    } catch (e) { console.log('Error querying bookings:', e.message); }

    console.log('\n--- Recent Cash Flow (Top 3) ---');
    try {
        const cashFlow = await client.query(`
            SELECT id, flow_type, category, amount, description, payment_method, created_at 
            FROM cash_flow 
            ORDER BY created_at DESC 
            LIMIT 3;
        `);
        console.table(cashFlow.rows);
    } catch (e) { console.log('Error querying cash_flow:', e.message); }

    console.log('\n--- Recent Customer Transactions (Top 3) ---');
    try {
        const transactions = await client.query(`
            SELECT id, type, amount, description, booking_id, created_at 
            FROM customer_transactions 
            ORDER BY created_at DESC 
            LIMIT 3;
        `);
        console.table(transactions.rows);
    } catch (e) { console.log('Error querying transactions:', e.message); }

  } catch (err) {
    console.error('Global Error:', err);
  } finally {
    await client.end();
  }
}

main();
