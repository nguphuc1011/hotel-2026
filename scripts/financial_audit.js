const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function audit() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- WALLETS ---');
    const wallets = await client.query('SELECT id, name, balance, updated_at FROM public.wallets ORDER BY id');
    console.table(wallets.rows);

    console.log('\n--- CATEGORIES ---');
    const cats = await client.query('SELECT name, type, is_system, is_active FROM public.cash_flow_categories ORDER BY type, name');
    console.table(cats.rows);

    console.log('\n--- RECENT CASH FLOW (15 entries) ---');
    const cf = await client.query('SELECT flow_type, category, amount, payment_method_code, description, created_at FROM public.cash_flow ORDER BY created_at DESC LIMIT 15');
    console.table(cf.rows);

    console.log('\n--- ACTIVE TRIGGER ON cash_flow ---');
    const trigger = await client.query(`
      SELECT tgname, proname 
      FROM pg_trigger t 
      JOIN pg_proc p ON t.tgfoid = p.oid 
      WHERE tgrelid = 'public.cash_flow'::regclass AND tgisinternal = false
    `);
    console.table(trigger.rows);

    if (trigger.rows.length > 0) {
      for (const t of trigger.rows) {
        console.log(`\n--- DEFINITION OF ${t.proname} ---`);
        const def = await client.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = $1`, [t.proname]);
        if (def.rows.length > 0) console.log(def.rows[0].pg_get_functiondef);
      }
    }

    console.log('\n--- INTEGRITY CHECKS ---');
    // 1. Are there any negative balances where they shouldn't be?
    // Physical wallets (CASH/BANK) can be negative if overspent, but logically odd.
    // ESCROW should ideally not be negative.
    // RECEIVABLE is positive for debt.
    // REVENUE is positive for income.
    
    // 2. Sample check for ESCROW vs Deposits
    const escrowBalance = wallets.rows.find(w => w.id === 'ESCROW')?.balance || 0;
    console.log(`Current ESCROW Balance: ${Number(escrowBalance).toLocaleString()}`);

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

audit();
