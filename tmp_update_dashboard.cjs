const fs = require('fs');
const path = './components/AccountDashboard.tsx';
const content = fs.readFileSync(path, 'utf8');

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

            // 1. Credits (Clearly labeled as Beta/Coming Soon per instructions)
            const fetchWallet = supabase
                .from('credit_wallets')
                .select('balance')
                .eq('user_id', session.user.id)
                .maybeSingle()
                .then(res => res.error ? { data: null, error: res.error } : res);

            // 2. Commerce Tables (Parallel Fetch)
            const fetchProducts = supabase.from('products').select('*');
            
            // Fetch Orders WITH nested order_items to safely bypass potential RLS config limits on flat order_items
            const fetchOrders = supabase
                .from('orders')
                .select('*, order_items(*)')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            const fetchLicenses = supabase
                .from('licenses')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            const fetchDownloads = supabase
                .from('downloads')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            const fetchSubs = supabase
                .from('subscriptions')
                .select('id, status, current_period_end, canceled_at, updated_at, metadata')
                .eq('user_id', session.user.id)
                .order('updated_at', { ascending: false })
                .then(res => res.error ? { data: null, error: res.error } : res);

            const [walletRes, productsRes, ordersRes, licensesRes, downloadsRes, subsRes] = await Promise.all([
                fetchWallet,
                fetchProducts,
                fetchOrders,
                fetchLicenses,
                fetchDownloads,
                fetchSubs
            ]);

            // Strict Error Handling - Fail loudly in UI
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

            // In-Memory Lookup Maps for strict precedence joining
            const productsMap = new Map();
            fetchedProducts.forEach((p: any) => productsMap.set(p.id, p));
            
            const orderItemsMap = new Map();
            
            // Build flat orderItems lookup and also associate them back to their parent order_id
            fetchedOrders.forEach((o: any) => {
                if (o.order_items && Array.isArray(o.order_items)) {
                    o.order_items.forEach((item: any) => {
                        orderItemsMap.set(item.id, item);
                        if (!orderItemsMap.has(\`order_\${o.id}\`)) {
                            orderItemsMap.set(\`order_\${o.id}\`, []);
                        }
                        orderItemsMap.get(\`order_\${o.id}\`).push(item);
                    });
                }
            });

            // Helper to resolve 3-step precedence
            const resolveName = (primaryName: string | undefined | null, orderItemId: string | null, orderId: string | null, productId: string | null, fallback: string) => {
                if (primaryName) return primaryName;

                let linkedItem = orderItemId ? orderItemsMap.get(orderItemId) : null;
                // If no direct item link, guess from order if it only has 1 item
                if (!linkedItem && orderId) {
                    const itemsForOrder = orderItemsMap.get(\`order_\${orderId}\`);
                    if (itemsForOrder && itemsForOrder.length === 1) {
                        linkedItem = itemsForOrder[0];
                    }
                }

                if (linkedItem?.product_name_snapshot) return linkedItem.product_name_snapshot;

                const linkedProductId = productId || linkedItem?.product_id;
                if (linkedProductId) {
                    const linkedProduct = productsMap.get(linkedProductId);
                    if (linkedProduct?.display_name) return linkedProduct.display_name;
                }

                return fallback;
            };

            // Mapping Orders
            const mappedOrders: OrderViewModel[] = [];
            fetchedOrders.forEach((o: any) => {
                const items = o.order_items || [];
                if (items.length === 0) {
                    mappedOrders.push({
                        orderNumber: o.order_number || o.id?.substring(0, 8) || 'Unknown',
                        productName: 'Unknown Purchase',
                        amountFormatted: o.total_amount != null ? \`$\${parseFloat(o.total_amount).toFixed(2)}\` : 'N/A',
                        paymentStatus: o.payment_status || 'Unknown',
                        deliveryStatus: o.fulfillment_status || 'Unknown',
                        purchaseDate: o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Unknown date'
                    });
                } else {
                    items.forEach((item: any) => {
                        const productName = resolveName(item.product_name_snapshot, item.id, o.id, item.product_id, 'Unknown Product');
                        mappedOrders.push({
                            orderNumber: o.order_number || o.id?.substring(0, 8) || 'Unknown',
                            productName: productName,
                            amountFormatted: item.amount != null ? \`$\${parseFloat(item.amount).toFixed(2)}\` : (o.total_amount != null ? \`$\${parseFloat(o.total_amount).toFixed(2)}\` : 'N/A'),
                            paymentStatus: o.payment_status || 'Unknown',
                            deliveryStatus: o.fulfillment_status || 'Unknown',
                            purchaseDate: o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Unknown date'
                        });
                    });
                }
            });

            // Mapping Licenses (Strict Rule: Only show actual license rows)
            const mappedLicenses: LicenseViewModel[] = [];
            fetchedLicenses.forEach((l: any) => {
                const key = l.license_key || 'KEY-MISSING';
                const masked = key.length > 10 ? \`\${key.substring(0, 5)}...\${key.substring(key.length - 5)}\` : '••••••••••••';
                
                const licenseName = resolveName(l.license_name, l.order_item_id, l.order_id, l.product_id, 'Unknown License');

                mappedLicenses.push({
                    licenseName: licenseName,
                    licenseKeyFull: key,
                    licenseKeyMasked: masked,
                    status: l.status === 'active' ? 'Active' : (l.status === 'revoked' ? 'Revoked' : 'Unknown'),
                    type: l.license_type || l.metadata?.license_type || 'Perpetual', // Trust DB column first
                    issuedOn: l.issued_on ? new Date(l.issued_on).toLocaleDateString() : (l.created_at ? new Date(l.created_at).toLocaleDateString() : 'Unknown date'),
                    assignedTo: l.assigned_to || session.user.email || 'Unknown',
                    entitlements: l.metadata?.entitlements
                });
            });

            // Mapping Downloads (Deduplication + Strict Precedence)
            const downloadGroups = new Map<string, any[]>();
            
            fetchedDownloads.forEach((d: any) => {
                const pId = d.product_id || 'unknown';
                const platform = d.platform || 'unknown';
                const version = d.version || 'unknown';
                const fileType = d.file_type || 'unknown';
                
                // Specific requested key schema
                const identity = \`\${pId}::\${platform}::\${version}::\${fileType}\`;
                
                if (!downloadGroups.has(identity)) {
                    downloadGroups.set(identity, []);
                }
                downloadGroups.get(identity).push(d);
            });

            const mappedDownloads: DownloadViewModel[] = [];
            
            for (const [identity, tokens] of Array.from(downloadGroups.entries())) {
                tokens.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
                
                const now = new Date();
                const validTokens = tokens.filter(t => t.expires_at && new Date(t.expires_at) > now && t.download_url);
                const selectedToken = validTokens.length > 0 ? validTokens[0] : tokens[0];
                const isAvailable = selectedToken.expires_at ? new Date(selectedToken.expires_at) > now : false;

                const downloadName = resolveName(selectedToken.display_name, selectedToken.order_item_id, selectedToken.order_id, selectedToken.product_id, 'Unknown Download');
                
                mappedDownloads.push({
                    id: selectedToken.id || Math.random().toString(),
                    productName: downloadName,
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

            // 6. Guest Purchase Detection (Unclaimed check by email)
            const lacksData = fetchedOrders.length === 0 && fetchedLicenses.length === 0 && fetchedDownloads.length === 0;

            if (lacksData && session.user.email) {
                const guestCheck = await supabase
                    .from('orders')
                    .select('id')
                    .eq('customer_email', session.user.email)
                    .is('user_id', null)
                    .limit(1)
                    .maybeSingle();

                 if (guestCheck.data) {
                     setHasGuestPurchases(true);
                 }
            }

        } catch (err) {
            console.error("Dashboard massive structural failure:", err);
            setErrorState("An unexpected error occurred while loading your dashboard. Please check console for details.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboard();
    }, [session.user.id, session.user.email]);

    return (
        <section id="account-dashboard" className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
            <div className="container mx-auto px-6">
                <div className="max-w-5xl mx-auto">
                    
                    {/* Header */}
                    <div className="mb-8">
                        <h2 className="text-3xl md:text-4xl font-bold mb-2">Account Dashboard</h2>
                        <p className="text-nano-text">
                            Signed in as {session.user.email}
                        </p>
                    </div>

                    {loading ? (
                        <div className="rounded-sm border border-nano-border bg-nano-panel/40 p-12 text-center text-nano-text animate-pulse">
                            Syncing data with Cast Director Studio...
                        </div>
                    ) : errorState ? (
                        <div className="rounded-sm border border-red-500/50 bg-red-500/10 p-12 text-center text-red-500 font-bold">
                            {errorState}
                        </div>
                    ) : (
                        <>`;

const startIdx = content.indexOf('    // Core data streams');
const endIdx = content.indexOf('                        <>') + 26;

if (startIdx !== -1 && endIdx !== -1) {
    const updated = content.substring(0, startIdx) + newCode + content.substring(endIdx);
    fs.writeFileSync(path, updated);
    console.log('Success');
} else {
    console.log('Failed to find markers');
}
