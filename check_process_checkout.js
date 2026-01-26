
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Checking process_checkout definition ---');
    const res = await client.query(`
        SELECT proname, prosecdef, prosrc
        FROM pg_proc
        WHERE proname = 'process_checkout'
    `);
    
    res.rows.forEach(r => {
        console.log(`Function: ${r.proname}`);
        console.log(`Security Definer: ${r.prosecdef}`); // true if SECURITY DEFINER
        console.log(`Source snippet: ${r.prosrc.substring(0, 100)}...`);
        // Check for payment_method usage
        const insertIdx = r.prosrc.indexOf('INSERT INTO public.cash_flow');
        if (insertIdx !== -1) {
            console.log('Insert logic:', r.prosrc.substring(insertIdx, insertIdx + 400));
        }
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
