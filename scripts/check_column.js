
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function checkColumn() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pending_approvals' AND column_name = 'approved_by_staff_id'
    `);
    console.log('Column check:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkColumn();
