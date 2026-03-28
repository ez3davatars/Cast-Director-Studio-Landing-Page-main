const fs = require('fs');
const url = "https://wtgkeytabshxtspjoegb.supabase.co/rest/v1";
const key = "sb_publishable_FhiFrfa7WdPXd-5FvU1_Tw_x1KDBY9E";

async function fetchRows(table) {
    let out = "";
    try {
        const res = await fetch(`${url}/${table}?limit=1`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });
        
        if (res.status === 404) {
            out += `\n--- Table: ${table} DOES NOT EXIST ---\n`;
            return out;
        }

        const data = await res.json();
        if (!res.ok) {
            out += `\n--- Table: ${table} ERROR ---\n${JSON.stringify(data)}\n`;
            return out;
        }

        if (Array.isArray(data) && data.length > 0) {
            out += `\n--- Table: ${table} ---\n`;
            out += Object.keys(data[0]).join(', ') + "\n";
        } else if (Array.isArray(data)) {
            out += `\n--- Table: ${table} (Empty) ---\n`;
        } else {
             out += `\n--- Table: ${table} UNEXPECTED ---\n${JSON.stringify(data)}\n`;
        }
    } catch (e) {
        out += `Error: ${e}\n`;
    }
    return out;
}

async function run() {
    const tables = ['products', 'orders', 'order_items', 'licenses', 'downloads', 'entitlements', 'subscriptions', 'stripe_webhooks'];
    let finalOut = "";
    for (const t of tables) {
        finalOut += await fetchRows(t);
    }
    fs.writeFileSync('tmp_schema.txt', finalOut);
    console.log("Done");
}
run();
