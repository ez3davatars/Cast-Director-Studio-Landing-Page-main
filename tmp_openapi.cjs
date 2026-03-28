const fs = require('fs');
const url = "https://wtgkeytabshxtspjoegb.supabase.co/rest/v1/?apikey=sb_publishable_FhiFrfa7WdPXd-5FvU1_Tw_x1KDBY9E";

async function fetchSchema() {
    try {
        const res = await fetch(url, {
            headers: {
                'apikey': 'sb_publishable_FhiFrfa7WdPXd-5FvU1_Tw_x1KDBY9E',
                'Authorization': `Bearer sb_publishable_FhiFrfa7WdPXd-5FvU1_Tw_x1KDBY9E`,
                'Accept': 'application/openapi+json'
            }
        });
        const data = await res.json();
        
        const defs = data.definitions || data.components?.schemas;
        if (!defs) {
            console.log("NO DEFINITIONS FOUND. Keys:", Object.keys(data));
            fs.writeFileSync('tmp_openapi.txt', JSON.stringify(data, null, 2));
            return;
        }

        let out = "";
        const tablesToInspect = ['products', 'orders', 'order_items', 'licenses', 'downloads', 'entitlements', 'subscriptions', 'stripe_webhooks'];
        for (const table of tablesToInspect) {
            if (defs[table]) {
                out += `\n--- Table: ${table} ---\n`;
                const props = defs[table].properties;
                for (const [key, val] of Object.entries(props)) {
                    out += `- ${key}: ${val.type} ${val.format ? '('+val.format+')' : ''}\n`;
                }
            } else {
                out += `\n--- Table: ${table} NOT FOUND ---\n`;
            }
        }
        fs.writeFileSync('tmp_openapi.txt', out);
        console.log("Done");
    } catch (e) {
        console.error(e);
    }
}
fetchSchema();
