const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length > 0) {
    env[key.trim()] = values.join('=').trim().replace(/['"]/g, '');
  }
});

async function run() {
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/?apikey=${env.VITE_SUPABASE_ANON_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  
  const subs = json.definitions.subscriptions;
  const emails = json.definitions.email_sends;
  
  console.log("Subscriptions Columns:", subs ? Object.keys(subs.properties) : "NOT FOUND");
  console.log("Email_Sends Columns:", emails ? Object.keys(emails.properties) : "NOT FOUND");
}
run();
