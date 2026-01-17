const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

const sql = `
${require('fs').readFileSync('c:/1hotel2/src/lib/billing_engine.sql', 'utf8')}
`;

async function run() {
  await client.connect();
  try {
    await client.query(sql);
    console.log('Successfully updated database functions.');
  } catch (e) {
    console.error('Error updating database functions:', e);
  } finally {
    await client.end();
  }
}

run();
