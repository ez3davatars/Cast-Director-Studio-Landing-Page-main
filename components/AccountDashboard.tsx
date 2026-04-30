import React, { useEffect, useState } from 'react';
import SupportTickets from './SupportTickets';
import ClaimPurchasesModal from './ClaimPurchasesModal';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getProductByStripePriceId, getProductByKey, resolveCatalogEntryFromDbProduct } from '../lib/products';
import { OrderViewModel, LicenseViewModel, DownloadViewModel } from '../types';
import { Loader2 } from 'lucide-react';

interface AccountDashboardProps {
    session: Session;
}

const AccountDashboard: React.FC<AccountDashboardProps> = ({ session }) => {
    const [loading, setLoading] = useState(true);

    // Core data streams
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

    // Credit top-up state
    const [topUpLoading, setTopUpLoading] = useState<string | null>(null);
    const [topUpError, setTopUpError] = useState<string | null>(null);

    // BYOK license status
    const [byokError, setByokError] = useState<string | null>(null);
    const [byokStatus, setByokStatus] = useState<{
        hasIndie: boolean;
        hasAgency: boolean;
        indieLicense: any | null;
        agencyLicense: any | null;
        indieExpiration: Date | null;
        agencyExpiration: Date | null;
    } | null>(null);

    const isExpiringOrExpired = (date: Date | null): boolean => {
        if (!date) return false;
        const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        return date <= sixtyDaysFromNow;
    };
    const isExpired = (date: Date | null): boolean => {
        if (!date) return false;
        return date <= new Date();
    };

    const loadDashboard = async () => {
        try {
            setLoading(true);
            setErrorState(null);

            const fetchWallet = supabase.from('profiles').select('credit_balance').eq('id', session.user.id).maybeSingle().then(res => res.error ? { data: null, error: res.error } : res);
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
                        if (!orderItemsMap.has(`order_${o.id}`)) orderItemsMap.set(`order_${o.id}`, []);
                        orderItemsMap.get(`order_${o.id}`).push(item);
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
            ): { name: string; source: string; reason?: string; resolvedPriceId?: string; resolvedProductKey?: string } => {
                
                let linkedItem: any = orderItemId ? orderItemsMap.get(orderItemId) : null;
                if (!linkedItem && orderId) {
                    const itemsForOrder = orderItemsMap.get(`order_${orderId}`);
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
                    console.log(`[Identity Trace: ${type}] Resolved "${name}" (${source})`, {
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

                return { name, source, reason, resolvedPriceId: resolvedStripePriceId, resolvedProductKey: linkedProduct?.product_key };
            };

            const mappedOrders: OrderViewModel[] = [];
            fetchedOrders.forEach((o: any) => {
                const items = o.order_items || [];
                if (items.length === 0) {
                    mappedOrders.push({
                        orderNumber: o.order_number || o.id?.substring(0, 8) || 'Unknown',
                        productName: 'Unnamed Product',
                        amountFormatted: o.total_amount != null ? `$${parseFloat(o.total_amount).toFixed(2)}` : 'N/A',
                        paymentStatus: o.payment_status || 'Unknown',
                        deliveryStatus: o.fulfillment_status || 'Unknown',
                        purchaseDate: o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Unknown date'
                    });
                } else {
                    items.forEach((item: any) => {
                        const identity = resolveIdentity('order', item.product_name_snapshot, item.id, o.id, item.product_id, item.stripe_price_id, 'Cast Director Studio Product', item);
                        mappedOrders.push({
                            orderNumber: o.order_number || o.id?.substring(0, 8) || 'Unknown',
                            productName: identity.name,
                            amountFormatted: item.amount != null ? `$${parseFloat(item.amount).toFixed(2)}` : (o.total_amount != null ? `$${parseFloat(o.total_amount).toFixed(2)}` : 'N/A'),
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
                const masked = key.length > 10 ? `${key.substring(0, 5)}...${key.substring(key.length - 5)}` : '••••••••••••';
                const identity = resolveIdentity('license', l.license_name, l.order_item_id, l.order_id, l.product_id, l.stripe_price_id, 'Cast Director Studio License', l);

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
                const catalogEntry = getProductByStripePriceId(d.stripe_price_id);
                
                const pId = d.product_id || 'unknown';
                const platform = d.platform || catalogEntry?.platform || 'Unknown';
                const version = d.version || 'Latest';
                const fileType = d.file_type || catalogEntry?.fileType || 'Unknown';
                
                const identityStr = `${pId}::${platform}::${version}::${fileType}`;
                if (!downloadGroups.has(identityStr)) downloadGroups.set(identityStr, []);
                downloadGroups.get(identityStr)!.push(d);
            });

            const mappedDownloads: DownloadViewModel[] = [];
            for (const [identityStr, tokens] of Array.from(downloadGroups.entries())) {
                tokens.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
                const now = new Date();
                const validTokens = tokens.filter(t => t.expires_at && new Date(t.expires_at) > now && t.download_url);
                const selectedToken = validTokens.length > 0 ? validTokens[0] : tokens[0];
                const isAvailable = selectedToken.expires_at ? new Date(selectedToken.expires_at) > now : false;

                const identity = resolveIdentity('download', selectedToken.display_name, selectedToken.order_item_id, selectedToken.order_id, selectedToken.product_id, selectedToken.stripe_price_id, 'Cast Director Studio Download', selectedToken);
                
                const catalogEntry = getProductByStripePriceId(identity.resolvedPriceId) || getProductByKey(identity.resolvedProductKey);
                
                mappedDownloads.push({
                    id: selectedToken.id || Math.random().toString(),
                    productName: identity.name,
                    platform: selectedToken.platform || catalogEntry?.platform || 'Unknown',
                    version: selectedToken.version || 'Latest',
                    fileType: selectedToken.file_type || catalogEntry?.fileType || 'Unknown',
                    expiresAt: selectedToken.expires_at ? new Date(selectedToken.expires_at).toLocaleDateString() : undefined,
                    downloadUrl: selectedToken.download_url,
                    canGenerateNewLink: false,
                    isAvailable
                });
            }

            setCredits(walletRes.data?.credit_balance ?? null);
            setOrders(mappedOrders.length > 0 ? mappedOrders : null);
            setLicenses(mappedLicenses.length > 0 ? mappedLicenses : null);
            setDownloads(mappedDownloads.length > 0 ? mappedDownloads : null);
            setSubscriptions(subsRes.data ?? null);

            // Analyze BYOK license ownership
            const getByokExpiration = (lic: any): Date | null => {
                if (!lic) return null;
                const updates = lic.updates_expires_at ? new Date(lic.updates_expires_at) : null;
                const support = lic.support_expires_at ? new Date(lic.support_expires_at) : null;
                if (updates && support) return updates < support ? updates : support;
                return updates || support || null;
            };
            const indieLic = fetchedLicenses.find((l: any) => {
                const prod = productsMap.get(l.product_id);
                return prod?.product_key === 'indie_desktop_byok' && l.status === 'active';
            });
            const agencyLic = fetchedLicenses.find((l: any) => {
                const prod = productsMap.get(l.product_id);
                return prod?.product_key === 'agency_desktop_byok' && l.status === 'active';
            });
            setByokStatus({
                hasIndie: !!indieLic,
                hasAgency: !!agencyLic,
                indieLicense: indieLic || null,
                agencyLicense: agencyLic || null,
                indieExpiration: getByokExpiration(indieLic),
                agencyExpiration: getByokExpiration(agencyLic),
            });

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
    };

    useEffect(() => {
        // Safety net: silently invoke claim-purchases on mount to link any
        // pending guest purchases to this authenticated user before loading data.
        const claimAndLoad = async () => {
            try {
                await supabase.functions.invoke('claim-purchases', { body: {} });
            } catch (err) {
                // Non-blocking — claim is a best-effort safety net
                console.warn('[Dashboard] claim-purchases safety net failed:', err);
            }
            loadDashboard();
        };
        claimAndLoad();
    }, [session.user.id, session.user.email]);

    // ── Credit Top-Up Checkout ──
    const handleTopUp = async (packKey: 'credit_pack_100' | 'credit_pack_500') => {
        setTopUpLoading(packKey);
        setTopUpError(null);

        try {
            // Find the product in Supabase by product_key
            const { data: products } = await supabase.from('products').select('*').eq('product_key', packKey).eq('is_active', true).maybeSingle();
            const product = products;

            if (!product || !product.stripe_price_id) {
                setTopUpError('Credit pack is currently unavailable. Please try again later.');
                return;
            }

            // Validate not a placeholder Stripe Price ID
            if (product.stripe_price_id.startsWith('REPLACE_WITH_')) {
                setTopUpError('Credit packs are not yet configured for checkout.');
                return;
            }

            const { data: { session: activeSession } } = await supabase.auth.getSession();
            if (!activeSession?.access_token) {
                setTopUpError('Please sign in to purchase credits.');
                return;
            }

            const catalogEntry = resolveCatalogEntryFromDbProduct(product);
            const successType = 'topup';
            const returnUrl = `${window.location.origin}/get-started?session_id={CHECKOUT_SESSION_ID}&type=${successType}`;

            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                body: {
                    priceId: product.stripe_price_id,
                    successUrl: returnUrl,
                    cancelUrl: `${window.location.origin}/#pricing`,
                }
            });

            if (error) throw new Error(error.message || 'Checkout failed');
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error('Checkout session URL was not returned.');
            }
        } catch (err: any) {
            console.error('Credit top-up checkout failed:', err);
            setTopUpError(err.message || 'An unexpected error occurred.');
        } finally {
            setTopUpLoading(null);
        }
    };

    // ── BYOK / Renewal Checkout ──
    const handleByokCheckout = async (productKey: string) => {
        setTopUpLoading(productKey);
        setByokError(null);

        try {
            const { data: product } = await supabase.from('products').select('*').eq('product_key', productKey).eq('is_active', true).maybeSingle();

            if (!product || !product.stripe_price_id) {
                setByokError('This product is currently unavailable. Please try again later.');
                return;
            }
            if (product.stripe_price_id.startsWith('REPLACE_WITH_')) {
                setByokError('This product is not yet configured for checkout.');
                return;
            }

            const { data: { session: activeSession } } = await supabase.auth.getSession();
            if (!activeSession?.access_token) {
                setByokError('Please sign in to continue.');
                return;
            }

            const successType = productKey.includes('updates') || productKey.includes('support') ? 'renewal' : 'byok';
            const returnUrl = `${window.location.origin}/get-started?session_id={CHECKOUT_SESSION_ID}&type=${successType}`;

            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                body: {
                    priceId: product.stripe_price_id,
                    successUrl: returnUrl,
                    cancelUrl: `${window.location.origin}/#pricing`,
                }
            });

            if (error) {
                // Handle duplicate purchase gracefully
                const parsed = typeof error === 'string' ? { message: error } : error;
                if (parsed?.context?.code === 'duplicate_purchase' || parsed?.message?.includes('already own')) {
                    setByokError(parsed?.context?.message || 'You already own this product.');
                } else {
                    throw new Error(parsed?.message || 'Checkout failed');
                }
                return;
            }
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error('Checkout session URL was not returned.');
            }
        } catch (err: any) {
            console.error('BYOK checkout failed:', err);
            setByokError(err.message || 'An unexpected error occurred.');
        } finally {
            setTopUpLoading(null);
        }
    };

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
                        <>
                            {/* Dashboard Level Recovery Action */}
                            {hasGuestPurchases && (
                                <div className="mb-8 rounded-sm border border-nano-yellow/50 bg-nano-yellow/10 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-xl font-bold text-nano-yellow mb-1">Unclaimed Purchases Found</h3>
                                        <p className="text-sm text-nano-text">
                                            We found guest purchases associated with <strong>{session.user.email}</strong> that aren't linked to your account yet.
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => setShowClaimModal(true)}
                                        className="shrink-0 px-6 py-3 bg-nano-yellow text-black font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors flex flex-col items-center"
                                    >
                                        <span>Claim Purchases</span>
                                    </button>
                                </div>
                            )}

                            {showClaimModal && (
                                <ClaimPurchasesModal 
                                    session={session} 
                                    onClose={() => setShowClaimModal(false)}
                                    onSuccess={() => {
                                        setShowClaimModal(false);
                                        setHasGuestPurchases(false);
                                        loadDashboard();
                                    }}
                                />
                            )}

                            {/* Overview Cards */}
                            <div className="grid md:grid-cols-3 gap-6 mb-12">
                                <div className="rounded-sm border border-nano-border bg-nano-panel/40 p-6">
                                    <div className="text-sm uppercase tracking-wide text-nano-text mb-2 flex justify-between items-center">
                                        <span>Generation Credits</span>
                                    </div>
                                    <div className="text-4xl font-bold text-white">
                                        {credits !== null ? credits : '--'}
                                    </div>
                                    <p className="text-xs text-nano-text mt-2">Available credit balance</p>
                                </div>

                                <div className="rounded-sm border border-nano-border bg-nano-panel/40 p-6">
                                    <div className="text-sm uppercase tracking-wide text-nano-text mb-2">
                                        Active Licenses
                                    </div>
                                    <div className="text-4xl font-bold text-white">
                                        {licenses ? licenses.filter(l => l.status === 'active').length : 0}
                                    </div>
                                    <p className="text-xs text-nano-text mt-2">Currently valid keys</p>
                                </div>

                                <div className="rounded-sm border border-nano-border bg-nano-panel/40 p-6">
                                    <div className="text-sm uppercase tracking-wide text-nano-text mb-2">
                                        Active Subscriptions
                                    </div>
                                    <div className="text-4xl font-bold text-white">
                                        {subscriptions ? subscriptions.filter(s => s.status === 'active').length : 0}
                                    </div>
                                    <p className="text-xs text-nano-text mt-2">Currently active plans</p>
                                </div>
                            </div>

                            {/* Credit Top-Up Section — only for users with credits or active subscriptions */}
                            {(credits !== null || (subscriptions && subscriptions.some(s => s.status === 'active'))) && (
                                <div className="mb-12 rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                    <h3 className="text-lg font-bold mb-2">Top Up Credits</h3>
                                    <p className="text-sm text-nano-text mb-4">
                                        Need more generations this month? Add extra credits without changing your plan.
                                    </p>
                                    {topUpError && (
                                        <div className="mb-4 p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-sm rounded-sm">
                                            {topUpError}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-4">
                                        <button
                                            onClick={() => handleTopUp('credit_pack_100')}
                                            disabled={!!topUpLoading}
                                            className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {topUpLoading === 'credit_pack_100' && <Loader2 size={14} className="animate-spin" />}
                                            100 Credits — $10
                                        </button>
                                        <button
                                            onClick={() => handleTopUp('credit_pack_500')}
                                            disabled={!!topUpLoading}
                                            className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {topUpLoading === 'credit_pack_500' && <Loader2 size={14} className="animate-spin" />}
                                            500 Credits — $45
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* BYOK Desktop License Section */}
                            {byokStatus && (
                                <div className="mb-12 rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                    {byokStatus.hasAgency ? (
                                        <>
                                            <h3 className="text-lg font-bold mb-4">Desktop License — Agency Commercial BYOK</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Status</div>
                                                    <div className="text-white font-medium">Active</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Device Activations</div>
                                                    <div className="text-white font-medium">3</div>
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">
                                                        {isExpired(byokStatus.agencyExpiration) ? 'Updates & Priority Support expired on' : 'Updates & Priority Support active until'}
                                                    </div>
                                                    <div className={`font-medium ${isExpired(byokStatus.agencyExpiration) ? 'text-red-400' : 'text-white'}`}>
                                                        {byokStatus.agencyExpiration ? byokStatus.agencyExpiration.toLocaleDateString() : 'Unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                            {isExpiringOrExpired(byokStatus.agencyExpiration) && (
                                                <div className="mt-4 pt-4 border-t border-nano-border/30">
                                                    <button
                                                        onClick={() => handleByokCheckout('agency_updates_support')}
                                                        disabled={!!topUpLoading}
                                                        className="px-6 py-3 bg-nano-yellow text-black font-bold text-sm uppercase tracking-wide hover:bg-nano-gold transition-all disabled:opacity-50 flex items-center gap-2"
                                                    >
                                                        {topUpLoading === 'agency_updates_support' && <Loader2 size={14} className="animate-spin" />}
                                                        Renew Updates & Priority Support — $249/year
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : byokStatus.hasIndie ? (
                                        <>
                                            <h3 className="text-lg font-bold mb-4">Desktop License — Indie Desktop BYOK</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Status</div>
                                                    <div className="text-white font-medium">Active</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Device Activations</div>
                                                    <div className="text-white font-medium">1</div>
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">
                                                        {isExpired(byokStatus.indieExpiration) ? 'Updates & Support expired on' : 'Updates & Support active until'}
                                                    </div>
                                                    <div className={`font-medium ${isExpired(byokStatus.indieExpiration) ? 'text-red-400' : 'text-white'}`}>
                                                        {byokStatus.indieExpiration ? byokStatus.indieExpiration.toLocaleDateString() : 'Unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-nano-border/30">
                                                {isExpiringOrExpired(byokStatus.indieExpiration) && (
                                                    <button
                                                        onClick={() => handleByokCheckout('indie_updates_support')}
                                                        disabled={!!topUpLoading}
                                                        className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center gap-2"
                                                    >
                                                        {topUpLoading === 'indie_updates_support' && <Loader2 size={14} className="animate-spin" />}
                                                        Renew Updates & Support — $99/year
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleByokCheckout('agency_desktop_byok')}
                                                    disabled={!!topUpLoading}
                                                    className="px-6 py-3 bg-nano-yellow text-black font-bold text-sm uppercase tracking-wide hover:bg-nano-gold transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {topUpLoading === 'agency_desktop_byok' && <Loader2 size={14} className="animate-spin" />}
                                                    Upgrade to Agency Commercial BYOK — $499
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <h3 className="text-lg font-bold mb-2">Upgrade to BYOK Desktop</h3>
                                            <p className="text-sm text-nano-text mb-4">
                                                Generate often? BYOK Desktop may save money by letting you connect your own Google/Vertex API key and pay the AI provider directly instead of relying only on monthly Cast Director Studio credits.
                                            </p>
                                            <div className="flex flex-wrap gap-4">
                                                <button
                                                    onClick={() => handleByokCheckout('indie_desktop_byok')}
                                                    disabled={!!topUpLoading}
                                                    className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {topUpLoading === 'indie_desktop_byok' && <Loader2 size={14} className="animate-spin" />}
                                                    Indie Desktop BYOK — $199
                                                </button>
                                                <button
                                                    onClick={() => handleByokCheckout('agency_desktop_byok')}
                                                    disabled={!!topUpLoading}
                                                    className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {topUpLoading === 'agency_desktop_byok' && <Loader2 size={14} className="animate-spin" />}
                                                    Agency Commercial BYOK — $499
                                                </button>
                                            </div>
                                        </>
                                    )}
                                    {byokError && (
                                        <div className="mt-4 p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-sm rounded-sm">
                                            {byokError}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid lg:grid-cols-2 gap-8">
                                {/* Left Column: Purchases & Subs */}
                                <div className="space-y-8">
                                    
                                    {/* Purchases List */}
                                    <div className="rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                        <h3 className="text-xl font-bold mb-6">Order History</h3>
                                        {!orders ? (
                                            <p className="text-nano-text text-sm italic">Purchase history is currently unavailable.</p>
                                        ) : orders.length === 0 ? (
                                            <p className="text-nano-text text-sm">No recorded purchases for this account.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {orders.map((order, idx) => (
                                                    <div key={order.orderNumber || idx} className="p-4 bg-black/30 border border-nano-border/50 text-sm">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <strong className="text-white block">Order #{order.orderNumber}</strong>
                                                            <span className="font-mono text-nano-yellow">{order.amountFormatted}</span>
                                                        </div>
                                                        <div className="text-white font-medium mb-3">{order.productName}</div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs text-nano-text mb-2">
                                                            <div>Payment: <span className="text-white capitalize">{order.paymentStatus}</span></div>
                                                            <div>Delivery: <span className="text-white capitalize">{order.deliveryStatus}</span></div>
                                                        </div>
                                                        <div className="text-[10px] text-nano-text/60">
                                                            Purchased: {order.purchaseDate}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Subscriptions List */}
                                    <div className="rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                        <h3 className="text-xl font-bold mb-6">Subscriptions</h3>
                                        {!subscriptions ? (
                                            <p className="text-nano-text text-sm italic">Subscription data is currently unavailable.</p>
                                        ) : subscriptions.length === 0 ? (
                                            <p className="text-nano-text text-sm">No active subscriptions.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {subscriptions.map((sub, idx) => (
                                                    <div key={idx} className="p-4 bg-black/30 border border-nano-border/50 text-sm flex justify-between items-center">
                                                        <div>
                                                            <strong className="text-white block uppercase tracking-wide">{sub.metadata?.product_name || 'Subscription'}</strong>
                                                            <span className={`text-xs ${sub.status === 'active' ? 'text-green-400' : 'text-nano-text'}`}>
                                                                Status: {sub.status || 'N/A'}
                                                            </span>
                                                        </div>
                                                        <div className="text-right text-xs text-nano-text">
                                                            <div>Renews: {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'N/A'}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                </div>

                                {/* Right Column: Digital Access (Licenses & Downloads) */}
                                <div className="space-y-8">
                                    
                                    {/* Licenses List */}
                                    <div className="rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                        <h3 className="text-xl font-bold mb-6">Software Licenses</h3>
                                        {!licenses ? (
                                            <p className="text-nano-text text-sm italic">License vault is currently unavailable.</p>
                                        ) : licenses.length === 0 ? (
                                            <p className="text-nano-text text-sm">No licenses have been issued for this account.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {licenses.map((lic, idx) => (
                                                    <div key={lic.licenseKeyFull || idx} className="p-4 bg-black/30 border border-nano-border/50 text-sm">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <strong className="text-white block truncate max-w-[200px]" title={lic.licenseName}>
                                                                {lic.licenseName}
                                                            </strong>
                                                            {lic.status.toLowerCase() === 'active' ? 
                                                                <span className="text-[10px] bg-green-900/40 text-green-400 px-2 py-0.5 rounded-sm uppercase tracking-wide border border-green-500/30">Active</span> 
                                                                : 
                                                                <span className="text-[10px] bg-red-900/40 text-red-400 px-2 py-0.5 rounded-sm uppercase tracking-wide border border-red-500/30">{lic.status}</span>
                                                            }
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-2 gap-2 text-xs text-nano-text mb-3">
                                                            <div>Type: <span className="text-white">{lic.type}</span></div>
                                                            <div>Assigned To: <span className="text-white truncate" title={lic.assignedTo}>{lic.assignedTo}</span></div>
                                                        </div>
                                                        
                                                        <div className="font-mono text-xs text-nano-yellow bg-black p-2 rounded-sm mb-1 break-all select-all group relative cursor-pointer" title="Click to reveal">
                                                            <span className="group-hover:hidden">{lic.licenseKeyMasked}</span>
                                                            <span className="hidden group-hover:inline">{lic.licenseKeyFull}</span>
                                                        </div>
                                                        <div className="text-[10px] text-nano-text/60 flex justify-between">
                                                            <span>Issued On: {lic.issuedOn}</span>
                                                        </div>
                                                        
                                                        {lic.entitlements && lic.entitlements.length > 0 && (
                                                            <div className="mt-3 pt-3 border-t border-nano-border/30 text-[10px] text-nano-text/80">
                                                                Includes: {lic.entitlements.join(', ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Downloads List */}
                                    <div className="rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                        <h3 className="text-xl font-bold mb-6">Software Downloads</h3>
                                        {!downloads ? (
                                            <p className="text-nano-text text-sm italic">Download server is currently unreachable.</p>
                                        ) : downloads.length === 0 ? (
                                            <p className="text-nano-text text-sm">No downloads available yet.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {downloads.map((dl, idx) => (
                                                    <div key={dl.id || idx} className="p-4 bg-black/30 border border-nano-border/50 text-sm">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <strong className="text-white block text-base">{dl.productName}</strong>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs text-nano-text mb-4">
                                                            <div>Platform: <span className="text-white">{dl.platform}</span></div>
                                                            <div>Version: <span className="text-white">{dl.version}</span></div>
                                                            <div>File Type: <span className="text-white">{dl.fileType}</span></div>
                                                        </div>
                                                        
                                                        {dl.expiresAt && (
                                                            <div className="text-xs text-nano-text mb-4">
                                                                Download link valid until {dl.expiresAt}
                                                            </div>
                                                        )}
                                                        
                                                        <div className="flex flex-col sm:flex-row gap-3 mt-4">
                                                            {dl.isAvailable && dl.downloadUrl ? (
                                                                <a 
                                                                    href={dl.downloadUrl}
                                                                    className="px-4 py-2 bg-nano-yellow text-black font-bold text-xs uppercase tracking-wide text-center hover:bg-nano-gold transition-colors block"
                                                                >
                                                                    Download Installer
                                                                </a>
                                                            ) : (
                                                                <button 
                                                                    disabled
                                                                    className="px-4 py-2 bg-gray-600 text-gray-400 font-bold text-xs uppercase tracking-wide text-center cursor-not-allowed border border-gray-600"
                                                                >
                                                                    Link Expired
                                                                </button>
                                                            )}
                                                            {/* Generate New Link button intentionally hidden until the feature is active */}
                                                        </div>
                                                        <div className="mt-4 pt-3 border-t border-nano-border/30 text-[10px] text-nano-text/80 leading-relaxed">
                                                            Your purchase remains active even if this download link expires.
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </div>

                            {/* Support Tickets — Full Width */}
                            <div className="mt-8">
                                <SupportTickets session={session} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
};

export default AccountDashboard;