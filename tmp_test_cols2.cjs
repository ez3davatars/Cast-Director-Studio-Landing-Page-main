const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length > 0) {
    env[key.trim()] = values.join('=').trim().replace(/['"]/g, '');
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkCol(table, col) {
  const { error } = await supabase.from(table).select(col).limit(1);
  if (error) {
    if (error.code === 'PGRST100' || error.message.includes('not find the column') || error.code === '42703' || error.message.includes('does not exist')) {
       return false;
    }
    // Print unknown errors to see wait it threw
    console.log(`[!] Error for ${table}.${col}: ${error.code} - ${error.message}`);
    // If it's a structural error that wasn't caught, return false just in case
    if (error.code && error.code.startsWith('PGRST')) return false;
    return true; 
  }
  return true; // No error means column exists
}

async function run() {
  const subsCols = ['id', 'created_at', 'status', 'stripe_customer_id', 'customer_email', 'user_id', 'plan_id'];
  console.log('--- SUBSCRIPTIONS ---');
  for (const c of subsCols) {
    const exists = await checkCol('subscriptions', c);
    console.log(`${c}: ${exists}`);
  }

  const emailCols = ['id', 'created_at', 'recipient', 'subject', 'status', 'provider_message_id', 'error', 'to_email', 'email'];
  console.log('--- EMAIL_SENDS ---');
  for (const c of emailCols) {
    const exists = await checkCol('email_sends', c);
    console.log(`${c}: ${exists}`);
  }
}

run();
