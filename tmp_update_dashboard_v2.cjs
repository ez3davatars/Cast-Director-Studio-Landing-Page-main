const fs = require('fs');
const path = './components/AccountDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Import
if (!content.includes('../lib/products')) {
    const importStr = "import { getProductByStripePriceId } from '../lib/products';\n";
    let insertIdx = content.indexOf('import { OrderViewModel');
    if (insertIdx === -1) insertIdx = content.indexOf('interface AccountDashboardProps');
    content = content.substring(0, insertIdx) + importStr + content.substring(insertIdx);
}

// 2. Rewrite loadDashboard
const newCode = `    // Core data streams
    const [credits, setCredits] = useState<number | null>(null);
    const [orders, setOrders] = useState<OrderViewModel[] | null>(null);
    const [licenses, setLicenses] = useState<LicenseViewModel[] | null>(null);
    const [downloads, setDownloads] = useState<DownloadViewModel[] | null>(null);
    const [subscriptions, setSubscriptions] = useState<any[] | null>(null);

    // Global Recovery flag
    const [hasGuestPurchases, setHasGuestPurchases] = useState(false);
    const [showClaimModal, setShowClaimModal] = useState(false);
    
    // Strict Error State
    const [errorState, setErrorState] = useState<string | null>(null);

    const loadDashboard = async () => {
        try {
            setLoading(true);
            setErrorState(null);

            const fetchWallet = supabase.from('credit_wallets').select('balance').eq('user_id', session.user.id).maybeSingle().then(res => res.error ? { data: null, error: res.error } : res);
            const fetchProducts = supabase.from('products').select('*');
            const fetchOrders = supabase.from('orders').select('*, order_items(*)').eq('user_id', session.user.id).order('created_at', { ascending: false });
            const fetchLicenses = supabase.from('licenses').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
            const fetchDownloads = supabase.from('downloads').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
            const fetchSubs = supabase.from('subscriptions').select('id, status, current_period_end, canceled_at, updated_at, metadata').eq('user_id', session.user.id).order('updated_at', { ascending: false }).then(res => res.error ? { data: null, error: res.error } : res);

            const [walletRes, productsRes, ordersRes, licensesRes, downloadsRes, subsRes] = await Promise.all([
                fetchWallet, fetchProducts, fetchOrders, fetchLicenses, fetchDownloads, fetchSubs
            ]);

            const criticalErrors = [productsRes.error, ordersRes.error, licensesRes.error, downloadsRes.error].filter(Boolean);
            if (criticalErrors.length > 0) {
                console.error("CRITICAL: Commerce tables failed to load.", criticalErrors);
                setErrorState("Failed to load commerce data. Please check your database schema and permissions.");
                return;
            }

            const fetchedProducts = productsRes.data || [];
            const fetchedOrders = ordersRes.data || [];
            const fetchedLicenses = licensesRes.data || [];
            const fetchedDownloads = downloadsRes.data || [];

            const productsMap = new Map();
            fetchedProducts.forEach((p: any) => productsMap.set(p.id, p));
            const orderItemsMap = new Map();
            fetchedOrders.forEach((o: any) => {
                if (o.order_items && Array.isArray(o.order_items)) {
                    o.order_items.forEach((item: any) => {
                        orderItemsMap.set(item.id, item);
                        if (!orderItemsMap.has(\`order_\${o.id}\`)) orderItemsMap.set(\`order_\${o.id}\`, []);
                        orderItemsMap.get(\`order_\${o.id}\`).push(item);
                    });
                }
            });

            const resolveIdentity = (
                type: 'order' | 'license' | 'download',
                primaryName: string | undefined | null,
                orderItemId: string | null,
                orderId: string | null,
                productId: string | null,
                stripePriceId: string | null,
                fallbackLabel: string,
                rawRow: any
            ): { name: string; source: string; reason?: string } => {
                
                let linkedItem: any = orderItemId ? orderItemsMap.get(orderItemId) : null;
                if (!linkedItem && orderId) {
                    const itemsForOrder = orderItemsMap.get(\`order_\${orderId}\`);
                    if (itemsForOrder && itemsForOrder.length === 1) linkedItem = itemsForOrder[0];
                }
                const linkedProductId = productId || linkedItem?.product_id;
                const linkedProduct = linkedProductId ? productsMap.get(linkedProductId) : null;
                const resolvedStripePriceId = stripePriceId || linkedItem?.stripe_price_id || linkedProduct?.stripe_price_id;

                let name = fallbackLabel;
                let source = 'fallback';
                let reason = '';

                // 1. Primary explicit name 
                if (primaryName) {
                    name = primaryName;
                    source = type === 'order' ? 'order_snapshot' : (type === 'license' ? 'license_name' : 'download_name');
                }
                // 2. Order Item Snapshot (for non-orders acting as linked fallback)
                else if (type !== 'order' && linkedItem?.product_name_snapshot) {
                    name = linkedItem.product_name_snapshot;
                    source = 'order_snapshot';
                }
                // 3. Order Item Metadata name (useful if snapshot not present but metadata is)
                else if (linkedItem?.metadata?.product_name) {
                     name = linkedItem.metadata.product_name;
                     source = 'order_metadata';
                }
                // 4. Product Display Name
                else if (linkedProduct?.display_name) {
                    name = linkedProduct.display_name;
                    source = 'product_display_name';
                }
                // 5. Shared Catalog Lookup
                else if (resolvedStripePriceId) {
                    const catalogMatch = getProductByStripePriceId(resolvedStripePriceId);
                    if (catalogMatch) {
                        name = catalogMatch.displayName;
                        source = 'price_id_catalog';
                    } else {
                        reason = 'missing_price_catalog_entry';
                    }
                } else {
                    if (!linkedItem) reason = 'missing_order_snapshot';
                    else if (!linkedProduct) reason = 'missing_product_join';
                    else reason = 'missing_stripe_price_id';
                }

                if (process.env.NODE_ENV === 'development') {
                    console.log(\`[Identity Trace: \${type}] Resolved "\${name}" (\${source})\`, {
                        missingIdentityReason: reason || undefined,
                        rawConfig: {
                            order_items_id: linkedItem?.id,
                            order_items_product_id: linkedItem?.product_id,
                            order_items_stripe_price_id: linkedItem?.stripe_price_id,
                            order_items_snapshot: linkedItem?.product_name_snapshot,
                            products_id: linkedProduct?.id,
                            products_display_name: linkedProduct?.display_name,
                            self_name: primaryName,
                            self_price_id: stripePriceId,
                            rawRow
                        }
                    });
                }

                return { name, source, reason };
            };

            const mappedOrders: OrderViewModel[] = [];
            fetchedOrders.forEach((o: any) => {
                const items = o.order_items || [];
                if (items.length === 0) {
                    mappedOrders.push({
                        orderNumber: o.order_number || o.id?.substring(0, 8) || 'Unknown',
                        productName: 'Unnamed Product',
                        amountFormatted: o.total_amount != null ? \`$\${parseFloat(o.total_amount).toFixed(2)}\` : 'N/A',
                        paymentStatus: o.payment_status || 'Unknown',
                        deliveryStatus: o.fulfillment_status || 'Unknown',
                        purchaseDate: o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Unknown date'
                    });
                } else {
                    items.forEach((item: any) => {
                        const identity = resolveIdentity('order', item.product_name_snapshot, item.id, o.id, item.product_id, item.stripe_price_id, 'Unnamed Product', item);
                        mappedOrders.push({
                            orderNumber: o.order_number || o.id?.substring(0, 8) || 'Unknown',
                            productName: identity.name,
                            amountFormatted: item.amount != null ? \`$\${parseFloat(item.amount).toFixed(2)}\` : (o.total_amount != null ? \`$\${parseFloat(o.total_amount).toFixed(2)}\` : 'N/A'),
                            paymentStatus: o.payment_status || 'Unknown',
                            deliveryStatus: o.fulfillment_status || 'Unknown',
                            purchaseDate: o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Unknown date'
                        });
                    });
                }
            });

            const mappedLicenses: LicenseViewModel[] = [];
            fetchedLicenses.forEach((l: any) => {
                const key = l.license_key || 'KEY-MISSING';
                const masked = key.length > 10 ? \`\${key.substring(0, 5)}...\${key.substring(key.length - 5)}\` : '••••••••••••';
                const identity = resolveIdentity('license', l.license_name, l.order_item_id, l.order_id, l.product_id, l.stripe_price_id, 'Unnamed License', l);

                mappedLicenses.push({
                    licenseName: identity.name,
                    licenseKeyFull: key,
                    licenseKeyMasked: masked,
                    status: l.status === 'active' ? 'Active' : (l.status === 'revoked' ? 'Revoked' : 'Unknown'),
                    type: l.license_type || l.metadata?.license_type || 'Perpetual', 
                    issuedOn: l.issued_on ? new Date(l.issued_on).toLocaleDateString() : (l.created_at ? new Date(l.created_at).toLocaleDateString() : 'Unknown date'),
                    assignedTo: l.assigned_to || session.user.email || 'Unknown',
                    entitlements: l.metadata?.entitlements
                });
            });

            const downloadGroups = new Map<string, any[]>();
            fetchedDownloads.forEach((d: any) => {
                const pId = d.product_id || 'unknown';
                const platform = d.platform || 'unknown';
                const version = d.version || 'unknown';
                const fileType = d.file_type || 'unknown';
                const identityStr = \`\${pId}::\${platform}::\${version}::\${fileType}\`;
                if (!downloadGroups.has(identityStr)) downloadGroups.set(identityStr, []);
                downloadGroups.get(identityStr).push(d);
            });

            const mappedDownloads: DownloadViewModel[] = [];
            for (const [identityStr, tokens] of Array.from(downloadGroups.entries())) {
                tokens.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
                const now = new Date();
                const validTokens = tokens.filter(t => t.expires_at && new Date(t.expires_at) > now && t.download_url);
                const selectedToken = validTokens.length > 0 ? validTokens[0] : tokens[0];
                const isAvailable = selectedToken.expires_at ? new Date(selectedToken.expires_at) > now : false;

                const identity = resolveIdentity('download', selectedToken.display_name, selectedToken.order_item_id, selectedToken.order_id, selectedToken.product_id, selectedToken.stripe_price_id, 'Unnamed Download', selectedToken);
                
                mappedDownloads.push({
                    id: selectedToken.id || Math.random().toString(),
                    productName: identity.name,
                    platform: selectedToken.platform || 'Unknown',
                    version: selectedToken.version || 'Unknown',
                    fileType: selectedToken.file_type || 'Unknown',
                    expiresAt: selectedToken.expires_at ? new Date(selectedToken.expires_at).toLocaleDateString() : undefined,
                    downloadUrl: selectedToken.download_url,
                    canGenerateNewLink: false,
                    isAvailable
                });
            }

            setCredits(walletRes.data?.balance ?? null);
            setOrders(mappedOrders.length > 0 ? mappedOrders : null);
            setLicenses(mappedLicenses.length > 0 ? mappedLicenses : null);
            setDownloads(mappedDownloads.length > 0 ? mappedDownloads : null);
            setSubscriptions(subsRes.data ?? null);

            const lacksData = fetchedOrders.length === 0 && fetchedLicenses.length === 0 && fetchedDownloads.length === 0;
            if (lacksData && session.user.email) {
                const guestCheck = await supabase.from('orders').select('id').eq('customer_email', session.user.email).is('user_id', null).limit(1).maybeSingle();
                 if (guestCheck.data) setHasGuestPurchases(true);
            }
        } catch (err) {
            console.error("Dashboard massive structural failure:", err);
            setErrorState("An unexpected error occurred while loading your dashboard. Please check console for details.");
        } finally {
            setLoading(false);
        }
    };`;

const startIdx = content.indexOf('    // Core data streams');
const endIdx = content.indexOf('                        <>') + 26;

if (startIdx !== -1 && endIdx !== -1) {
    const updated = content.substring(0, startIdx) + newCode + content.substring(endIdx);
    fs.writeFileSync(path, updated);
    console.log('Success');
} else {
    console.log('Failed to find markers');
}
