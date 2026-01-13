
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkData() {
  try {
    await client.connect();
    const rules = await client.query('SELECT * FROM surcharge_rules');
    console.log(`Surcharge Rules Table Rows: ${rules.rowCount}`);
    if (rules.rowCount > 0) console.log(rules.rows);
    
    const settings = await client.query('SELECT surcharge_rules FROM settings');
    console.log('Settings Surcharge Rules:', JSON.stringify(settings.rows[0].surcharge_rules));
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

checkData();
