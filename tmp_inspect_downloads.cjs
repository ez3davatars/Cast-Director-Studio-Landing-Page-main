require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectDownloads() {
    const { data: rows, error } = await supabase.from('downloads').select('*').limit(3);
    if (error) {
        console.error("Error fetching downloads", error);
        return;
    }
    console.log("Downloads schema keys:");
    if (rows && rows.length > 0) {
        console.log(Object.keys(rows[0]));
        console.log("Sample Data:", rows[0]);
    } else {
        console.log("No rows found.");
    }
}

inspectDownloads();
