
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- SIMULATION: CHECKOUT PAYMENT FLOW ---');
    
    // 1. Get Initial Balance
    const resBal1 = await client.query("SELECT balance FROM wallets WHERE id = 'CASH'");
    const initialBal = parseFloat(resBal1.rows[0].balance);
    console.log(`Initial CASH Balance: ${initialBal}`);

    // 2. Insert Dummy Cash Flow
    console.log('Inserting Test Cash Flow (50,000 VND)...');
    const resInsert = await client.query(`
        INSERT INTO cash_flow (
            flow_type, category, amount, description, 
            created_by, is_auto, occurred_at, payment_method_code
        ) VALUES (
            'IN', 'Tiền phòng', 50000, 'Simulation Test', 
            (SELECT id FROM auth.users LIMIT 1), true, now(), 'cash'
        ) RETURNING id;
    `);
    const newId = resInsert.rows[0].id;
    console.log(`Inserted ID: ${newId}`);

    // 3. Check Balance After Insert
    const resBal2 = await client.query("SELECT balance FROM wallets WHERE id = 'CASH'");
    const afterBal = parseFloat(resBal2.rows[0].balance);
    console.log(`Balance After Insert: ${afterBal}`);

    if (afterBal === initialBal + 50000) {
        console.log('✅ SUCCESS: Wallet updated correctly (+50,000).');
    } else {
        console.log(`❌ FAILURE: Wallet did not update correctly. Diff: ${afterBal - initialBal}`);
    }

    // 4. Clean up (Delete)
    console.log('Deleting Test Record...');
    await client.query(`DELETE FROM cash_flow WHERE id = $1`, [newId]);

    // 5. Check Balance After Delete
    const resBal3 = await client.query("SELECT balance FROM wallets WHERE id = 'CASH'");
    const finalBal = parseFloat(resBal3.rows[0].balance);
    console.log(`Balance After Delete: ${finalBal}`);

    if (finalBal === initialBal) {
        console.log('✅ SUCCESS: Wallet reverted correctly.');
    } else {
        console.log(`❌ FAILURE: Wallet did not revert correctly. Diff: ${finalBal - initialBal}`);
    }

  } catch (e) {
    console.error('❌ ERROR:', e.message);
  } finally {
    await client.end();
  }
}

run();
