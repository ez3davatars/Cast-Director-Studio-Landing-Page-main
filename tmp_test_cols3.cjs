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
    if (error.code === 'PGRST100' || error.message.includes('not find the column') || error.code === '42703' || error.message.includes('does not exist')) return false;
  }
  return true; 
}

async function run() {
  const emailCols = ['to', 'recipient_email', 'contact_email', 'customer_id', 'contact_id', 'user_id', 'receiver', 'target'];
  for (const c of emailCols) {
    const exists = await checkCol('email_sends', c);
    console.log(`${c}: ${exists}`);
  }
}

run();
