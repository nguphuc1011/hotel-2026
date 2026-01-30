const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
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
        console.log('Connected to DB');
        
        // 1. Get booking
        const res = await client.query("SELECT id, customer_id, deposit_amount FROM bookings WHERE status IN ('confirmed', 'checked_in') LIMIT 1");
        if (res.rows.length === 0) {
            console.log('No active booking found');
            return;
        }
        
        const booking = res.rows[0];
        console.log('Booking:', booking);
        
        const amount = 50000;
        
        // 2. Call RPC
        console.log('Calling RPC...');
        try {
            const rpcRes = await client.query(`
                SELECT * FROM adjust_customer_balance(
                    $1, $2, 'deposit', 'Test Debug Deposit', $3, NULL, NULL, 'cash'
                )
            `, [booking.customer_id, amount, booking.id]);
            console.log('RPC Output:', rpcRes.rows[0]);
        } catch (rpcErr) {
            console.error('RPC Failed:', rpcErr.message);
        }
        
        // 3. Verify
        const checkRes = await client.query("SELECT deposit_amount FROM bookings WHERE id = $1", [booking.id]);
        console.log('New Deposit Amount:', checkRes.rows[0].deposit_amount);
        
        const flowRes = await client.query("SELECT * FROM cash_flow WHERE ref_id = $1 ORDER BY created_at DESC LIMIT 1", [booking.id]);
        console.log('Cash Flow Record:', flowRes.rows[0]);
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
