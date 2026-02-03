const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const sqlFile = path.join(__dirname, '../db_scripts/create_update_booking_details_rpc.sql');
const rpcSql = fs.readFileSync(sqlFile, 'utf8');

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Connecting to DB to update RPC update_booking_details...');
    
    console.log('Executing SQL...');
    await client.query(rpcSql);
    
    console.log('✅ Successfully updated RPC update_booking_details!');
    
  } catch (err) {
    console.error('❌ Error updating RPC:', err);
  } finally {
    await client.end();
  }
}

main();
