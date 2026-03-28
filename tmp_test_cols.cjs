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
    if (error.message.includes('Could not find the column') || error.message.includes('No such column') || error.code === 'PGRST205' || error.message.includes('not find')) {
       return false;
    }
    // If it's an RLS error, the column exists!
    return true; 
  }
  return true; // No error means column exists
}

async function run() {
  const subsCols = ['stripe_customer_id', 'customer_email', 'status', 'created_at', 'user_id', 'email'];
  console.log('--- SUBSCRIPTIONS ---');
  for (const c of subsCols) {
    const exists = await checkCol('subscriptions', c);
    console.log(`${c}: ${exists}`);
  }

  const emailCols = ['recipient', 'subject', 'status', 'created_at', 'to_email', 'email', 'body'];
  console.log('--- EMAIL_SENDS ---');
  for (const c of emailCols) {
    const exists = await checkCol('email_sends', c);
    console.log(`${c}: ${exists}`);
  }
}

run();
