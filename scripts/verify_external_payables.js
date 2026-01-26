const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- STARTING VERIFICATION ---');

    // 1. Get initial Wallet Balances
    const resInitial = await client.query("SELECT id, balance FROM wallets WHERE id IN ('CASH', 'BANK', 'REVENUE')");
    const initialWallets = {};
    resInitial.rows.forEach(r => initialWallets[r.id] = parseFloat(r.balance));
    console.log('Initial Wallets:', initialWallets);

    // 2. Simulate Owner Expense (100k)
    console.log('\n--- Action: Owner pays 100,000 VND (Electricity) ---');
    const resExp = await client.query("SELECT record_owner_expense(100000, 'Test Tiền điện', 'Bệ Hạ') as result");
    const debtId = resExp.rows[0].result.payable_id;
    console.log('Created Debt ID:', debtId);

    // 3. Check Wallets after Expense
    const resAfterExp = await client.query("SELECT id, balance FROM wallets WHERE id IN ('CASH', 'BANK', 'REVENUE')");
    const afterExpWallets = {};
    resAfterExp.rows.forEach(r => afterExpWallets[r.id] = parseFloat(r.balance));
    console.log('Wallets after Expense:', afterExpWallets);

    // Verify Logic 1
    if (afterExpWallets.CASH !== initialWallets.CASH) console.error('FAIL: CASH changed!');
    else console.log('PASS: CASH unchanged.');
    
    if (afterExpWallets.REVENUE !== initialWallets.REVENUE - 100000) console.error(`FAIL: REVENUE did not decrease correctly. Expected ${initialWallets.REVENUE - 100000}, got ${afterExpWallets.REVENUE}`);
    else console.log('PASS: REVENUE decreased by 100,000 (Expense recorded).');

    // 4. Check External Payables
    const resDebt = await client.query("SELECT * FROM external_payables WHERE id = $1", [debtId]);
    if (resDebt.rows.length > 0 && resDebt.rows[0].amount == 100000) {
        console.log('PASS: External Payable record found.');
    } else {
        console.error('FAIL: External Payable record missing or incorrect.');
    }

    // 5. Simulate Repayment (Cash)
    console.log('\n--- Action: Repay Owner 100,000 VND (Cash) ---');
    await client.query("SELECT repay_owner_debt($1, 'cash')", [debtId]);

    // 6. Check Wallets after Repayment
    const resAfterRepay = await client.query("SELECT id, balance FROM wallets WHERE id IN ('CASH', 'BANK', 'REVENUE')");
    const afterRepayWallets = {};
    resAfterRepay.rows.forEach(r => afterRepayWallets[r.id] = parseFloat(r.balance));
    console.log('Wallets after Repayment:', afterRepayWallets);

    // Verify Logic 2
    if (afterRepayWallets.CASH !== afterExpWallets.CASH - 100000) console.error('FAIL: CASH did not decrease!');
    else console.log('PASS: CASH decreased by 100,000.');

    if (afterRepayWallets.REVENUE !== afterExpWallets.REVENUE) console.error('FAIL: REVENUE changed during Repayment!');
    else console.log('PASS: REVENUE unchanged during Repayment.');

    // 7. Check External Payables Status
    const resDebtFinal = await client.query("SELECT status FROM external_payables WHERE id = $1", [debtId]);
    if (resDebtFinal.rows[0].status === 'paid') {
        console.log('PASS: Debt status is PAID.');
    } else {
        console.error('FAIL: Debt status is ' + resDebtFinal.rows[0].status);
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

run();
