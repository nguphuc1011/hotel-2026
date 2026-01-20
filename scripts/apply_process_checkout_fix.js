require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const conn = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!conn) {
    console.error("❌ Missing POSTGRES_URL or DATABASE_URL in .env.local");
    process.exit(1);
}

async function run() {
    const client = new Client({ connectionString: conn });
    await client.connect();
    try {
        console.log('--- Applying Fix for process_checkout RPC ---');
        const sqlPath = path.join(__dirname, '../db_scripts/fix_process_checkout_cash_flow.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        await client.query(sql);
        console.log('✅ Successfully updated process_checkout RPC.');
        
        // Verify RLS policies on cash_flow just in case
        console.log('--- Verifying RLS on cash_flow ---');
        const rlsRes = await client.query(`
            SELECT tablename, rowsecurity 
            FROM pg_tables 
            WHERE tablename = 'cash_flow'
        `);
        console.log('Row Security:', rlsRes.rows[0]);

    } catch (e) {
        console.error('❌ Error applying fix:', e.message);
    } finally {
        await client.end();
    }
}

run();