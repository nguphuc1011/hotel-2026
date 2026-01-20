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
        console.log('--- Fixing Foreign Key Constraint for cash_flow ---');
        const sqlPath = path.join(__dirname, '../db_scripts/fix_cash_flow_fk.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        await client.query(sql);
        console.log('✅ Successfully updated cash_flow FK constraint.');
        
        // Verify
        const res = await client.query(`
            SELECT 
                conname AS constraint_name, 
                confrelid::regclass AS foreign_table_name
            FROM pg_constraint 
            WHERE conrelid::regclass::text = 'cash_flow' 
              AND conname = 'cash_flow_verified_by_staff_id_fkey';
        `);
        console.log('Verified Constraint:', res.rows[0]);

    } catch (e) {
        console.error('❌ Error applying fix:', e.message);
    } finally {
        await client.end();
    }
}

run();