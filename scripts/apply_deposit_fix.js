const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const migrationPath = path.join(__dirname, '../src/lib/migrations/20260312_fix_deposit_logic.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await client.connect();
    console.log('--- Applying Migration: Fix Deposit Logic ---');
    await client.query(sql);
    console.log('✅ Migration applied successfully!');

    // Also backup the old definition just in case
    const oldDef = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'adjust_customer_balance'");
    if (oldDef.rows.length > 0) {
        fs.writeFileSync('c:/1hotel2/rpc_defs_backup.sql', oldDef.rows[0].prosrc);
        console.log('Old RPC definition backed up to c:/1hotel2/rpc_defs_backup.sql');
    }

  } catch (err) {
    console.error('❌ Error applying migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
