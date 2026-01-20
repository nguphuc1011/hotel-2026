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
    console.log('--- Checking Audit Logs for Cash Flow Errors ---');
    const res = await client.query(`
        SELECT * FROM audit_logs 
        WHERE explanation::text LIKE '%Lỗi ghi nhận dòng tiền%'
        ORDER BY created_at DESC 
        LIMIT 5
    `);
    
    if (res.rows.length === 0) {
        console.log('No cash flow errors found in audit_logs.');
    } else {
        res.rows.forEach(r => {
            console.log(`[${r.created_at}] Staff: ${r.staff_id} - Error: ${JSON.stringify(r.explanation)}`);
        });
    }

    console.log('\n--- Checking last 5 normal audit logs ---');
    const resNormal = await client.query(`
        SELECT * FROM audit_logs 
        ORDER BY created_at DESC 
        LIMIT 5
    `);
    resNormal.rows.forEach(r => {
        console.log(`[${r.created_at}] Booking: ${r.booking_id} - Staff: ${r.staff_id}`);
    });

  } catch (e) {
    console.error('Error checking logs:', e.message);
  } finally {
    await client.end();
  }
}

run();
