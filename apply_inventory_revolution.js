const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: 'postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database');

    const sqlPath = path.join(__dirname, 'db_scripts', 'fix_inventory_revolution.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing Inventory Revolution script...');
    await client.query(sql);
    
    console.log('Inventory Revolution completed successfully!');
    
    // Notify PostgREST to reload schema cache
    await client.query("NOTIFY pgrst, 'reload config'");
    console.log('Notified PostgREST to reload config');

  } catch (err) {
    console.error('Error executing script:', err);
  } finally {
    await client.end();
  }
}

run();
