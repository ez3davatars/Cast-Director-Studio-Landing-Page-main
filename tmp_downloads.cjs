require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkDownloads() {
    const { data: cols, error: e1 } = await supabase.rpc('get_columns_for_downloads').catch(()=>({error: 'RPC missing'}));
    const { data: rows, error: e2 } = await supabase.from('downloads').select('*').limit(1);
    console.log('Downloads table sample:', rows);
}

checkDownloads();
