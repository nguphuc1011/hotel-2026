const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
let DATABASE_URL;

try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DATABASE_URL=(.*)/);
    if (match) {
        DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
    } else {
        const match2 = envContent.match(/POSTGRES_URL=(.*)/);
        if (match2) DATABASE_URL = match2[1].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (e) {}

if (!DATABASE_URL) {
    DATABASE_URL = process.env.DATABASE_URL;
}

const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log('--- LIVE DB INSPECTION ---');
        
        const functionsToInspect = ['process_checkout', 'adjust_customer_balance', 'calculate_booking_bill', 'update_booking_details', 'check_in_customer', 'cancel_booking', 'change_room'];
        
        const logFile = 'db_final_report.txt';
        fs.writeFileSync(logFile, '--- FINAL DB REPORT ---\n');
        
        const query = `
            SELECT 
                n.nspname as schema_name,
                p.proname as function_name, 
                pg_get_function_result(p.oid) as result_type,
                pg_get_function_arguments(p.oid) as argument_list
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY n.nspname, p.proname
        `;

        const res = await client.query(query);
        
        const output = res.rows.map(row => {
            return `Schema: ${row.schema_name} | Function: ${row.function_name}\nResult: ${row.result_type}\nArguments: ${row.argument_list}\n-------------------`;
        }).join('\n');

        console.log("Schema found:");
        console.log(output);

        fs.writeFileSync('db_actual_schema.txt', output);
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
