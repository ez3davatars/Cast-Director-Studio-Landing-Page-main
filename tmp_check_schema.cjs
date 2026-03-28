const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Simple env loader
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length > 0) {
    env[key.trim()] = values.join('=').trim().replace(/['"]/g, '');
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkTable(tableName) {
  console.log(`Checking table: ${tableName}`);
  const { data, error } = await supabase.from(tableName).select('*').limit(1);
  if (error) {
    console.log(`[ERROR on ${tableName}]: ${error.message} (Code: ${error.code})`);
    if (error.code === '42P01') {
      return false; // Table does not exist
    }
    return true; // Table exists but threw error (e.g. RLS or other)
  }
  console.log(`[SUCCESS on ${tableName}]: It exists and returned ${data?.length} rows.`);
  return true;
}

async function run() {
  const emailsExists = await checkTable('emails');
  const emailSendsExists = await checkTable('email_sends');
  
  console.log('--- Results ---');
  console.log(`emails exists: ${emailsExists}`);
  console.log(`email_sends exists: ${emailSendsExists}`);

  // check contacts
  const { data: contactsData, error: contactsErr } = await supabase.from('contacts').select('*').limit(1);
  console.log('Contacts check:', contactsErr ? contactsErr.message : 'Exists', Object.keys(contactsData?.[0] || {}));
}

run();
