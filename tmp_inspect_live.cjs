require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectLiveAuth() {
    const email = "erik@ez3davatars.com"; // from screenshot
    console.log("Looking up user identity...");
    
    // 1. Fetch products
    const { data: products } = await supabase.from('products').select('*');
    console.log("\n--- PRODUCTS ---");
    products.forEach(p => console.log(p.id, "|", p.display_name, "|", p.stripe_price_id));

    // We can't query auth.users from anon key to get user.id safely if RLS blocks it.
    // Let's just query licenses if RLS allows it, or use Service Role key if available.
    // Wait, the user ran local `npm run dev` and it authenticated them. 
}

async function inspectLiveService() {
    const supabaseAdmin = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    );

    const { data: products } = await supabaseAdmin.from('products').select('*');
    console.log("\n--- PRODUCTS ---");
    console.log(products);

    const { data: licenses } = await supabaseAdmin.from('licenses').select('*');
    console.log("\n--- LICENSES ---");
    console.log(licenses);
}

inspectLiveService();
