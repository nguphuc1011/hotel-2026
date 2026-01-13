
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
SELECT * FROM settings WHERE key = 'system_settings';
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    const res = await client.query(sql);
    console.log('Settings Row:', JSON.stringify(res.rows[0], null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
