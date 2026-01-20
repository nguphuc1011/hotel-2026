const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error('Missing DATABASE_URL or DIRECT_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Verifying Cash Flow Data ---');
    
    // 1. Count rows
    const resCount = await client.query('SELECT count(*) FROM cash_flow');
    console.log(`Total rows in cash_flow: ${resCount.rows[0].count}`);

    // 2. List last 5 rows
    const resRows = await client.query(`
        SELECT id, flow_type, amount, description, occurred_at, created_by 
        FROM cash_flow 
        ORDER BY occurred_at DESC 
        LIMIT 5
    `);
    console.log('Last 5 transactions:');
    resRows.rows.forEach(r => {
        console.log(`[${r.occurred_at.toISOString()}] ${r.flow_type} ${r.amount} - ${r.description} (User: ${r.created_by})`);
    });

    // 3. Check RLS policies
    const resPolicies = await client.query(`
        SELECT policyname, cmd, roles, qual, with_check 
        FROM pg_policies 
        WHERE tablename = 'cash_flow'
    `);
    console.log('\nActive RLS Policies:');
    resPolicies.rows.forEach(p => {
        console.log(`- ${p.policyname} (${p.cmd}): USING ${p.qual} / WITH CHECK ${p.with_check}`);
    });

    // 4. Test RPC fn_get_cash_flow_stats (as admin)
    const resStats = await client.query(`
        SELECT * FROM fn_get_cash_flow_stats(
            (now() - interval '30 days')::timestamptz, 
            now()::timestamptz
        )
    `);
    console.log('\nStats (last 30 days via RPC as Admin):', JSON.stringify(resStats.rows[0], null, 2));

  } catch (e) {
    console.error('Error verifying data:', e.message);
  } finally {
    await client.end();
  }
}

run();
