
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Checking ALL Audit Logs (Last 1 Hour) ---');
    const res = await client.query(`
        SELECT created_at, explanation, type, staff_id
        FROM audit_logs 
        WHERE created_at > now() - interval '2 hours'
        ORDER BY created_at DESC 
        LIMIT 20
    `);
    
    res.rows.forEach(r => {
        console.log(`[${r.created_at.toISOString()}] Type: ${r.type} | Msg: ${JSON.stringify(r.explanation)}`);
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
