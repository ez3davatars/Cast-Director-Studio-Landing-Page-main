require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectProducts() {
    const { data: products, error } = await supabase.from('products').select('*');
    if (error) {
        console.error('Error fetching products:', error);
    } else {
        console.log('Products:', JSON.stringify(products, null, 2));
    }
    
    // Also check order_items to see what price_ids were actually purchased
    const { data: orderItems, error: itemsError } = await supabase.from('order_items').select('id, product_id, stripe_price_id, product_name_snapshot, metadata').limit(5);
    if (itemsError) {
        console.error('Error fetching order items:', itemsError);
    } else {
        console.log('Recent Order Items:', JSON.stringify(orderItems, null, 2));
    }
}

inspectProducts();
