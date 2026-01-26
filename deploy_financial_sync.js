const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error('Missing DIRECT_URL or DATABASE_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    // 1. Apply check_in_customer.sql
    const checkInPath = path.join(__dirname, 'src/lib/check_in_customer.sql');
    const checkInSql = fs.readFileSync(checkInPath, 'utf8');
    console.log('Applying check_in_customer.sql...');
    await client.query(checkInSql);

    // 2. Apply night_audit_logic.sql
    const nightAuditPath = path.join(__dirname, 'db_scripts/night_audit_logic.sql');
    const nightAuditSql = fs.readFileSync(nightAuditPath, 'utf8');
    console.log('Applying night_audit_logic.sql...');
    await client.query(nightAuditSql);

    // 3. Apply billing_engine.sql (to ensure unified milestones are active)
    const billingPath = path.join(__dirname, 'src/lib/billing_engine.sql');
    const billingSql = fs.readFileSync(billingPath, 'utf8');
    console.log('Applying billing_engine.sql...');
    await client.query(billingSql);

    // 4. Apply financial_health_check.sql
    const healthPath = path.join(__dirname, 'db_scripts/financial_health_check.sql');
    const healthSql = fs.readFileSync(healthPath, 'utf8');
    console.log('Applying financial_health_check.sql...');
    await client.query(healthSql);

    console.log('Successfully applied all SQL changes.');
    
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
  } catch (e) {
    console.error('Error applying SQL:', e.message);
  } finally {
    await client.end();
  }
}

run();
