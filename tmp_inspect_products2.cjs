require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectProducts() {
    const { data: products } = await supabase.from('products').select('*');
    const { data: orderItems } = await supabase.from('order_items').select('*').limit(10);
    
    fs.writeFileSync('tmp_products.json', JSON.stringify({ products, orderItems }, null, 2));
    console.log('Saved to tmp_products.json');
}

inspectProducts();
