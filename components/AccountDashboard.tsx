import React, { useEffect, useState, useCallback, useRef } from 'react';
import SupportTickets from './SupportTickets';
import ClaimPurchasesModal from './ClaimPurchasesModal';
import { Session } from '@supabase/supabase-js';
import { supabase, invokeAuthenticatedFunction } from '../lib/supabase';
import { getProductByStripePriceId, getProductByKey, resolveCatalogEntryFromDbProduct } from '../lib/products';
import { getAffiliateAttributionHeaders, withAffiliateAttributionBody } from '../lib/affiliateAttribution';
import { startSubscriptionCheckout, SubscriptionAuthRequiredError, type SubscriptionPlan } from '../lib/launchCheckout';
import { resolveSubscriptionPlanKey, subscriptionPlanDisplayName } from '../lib/subscriptionDisplay';
import { OrderViewModel, LicenseViewModel, DownloadViewModel } from '../types';
import { Loader2, Info, MessageSquare, LifeBuoy, Monitor, Smartphone, Laptop, X, AlertTriangle } from 'lucide-react';

interface DeviceActivation {
    id: string;
    license_id: string;
    device_fingerprint: string;
    device_label: string;
    platform: string;
    app_version: string | null;
    status: string;
    first_activated_at: string;
    last_seen_at: string;
    deactivated_at: string | null;
}

interface AccountDashboardProps {
    session: Session;
}

const getActivationLimit = (license: any): number => {
  return Number(
    license?.max_activations ??
    license?.device_limit ??
    2
  );
};

const getDownloadId = (download: any): string | null => {
  return download?.id ?? download?.download_id ?? download?.downloadId ?? null;
};

const AccountDashboard: React.FC<AccountDashboardProps> = ({ session }) => {
    const [loading, setLoading] = useState(true);
    const [dbProducts, setDbProducts] = useState<any[]>([]);
    const displayEmail = new URLSearchParams(window.location.search).get('override_email') || session.user.email;

    const resolveSubKey = (item: any): string => {
        if (!item) return '';
        if (item.metadata?.product_key) return item.metadata.product_key;
        if (item.product_id && dbProducts && dbProducts.length > 0) {
            const dbProd = dbProducts.find((p: any) => p.id === item.product_id);
            if (dbProd?.product_key) return dbProd.product_key;
        }
        return (
            item?.product_key ||
            item?.productKey ||
            item?.plan_key ||
            item?.planKey ||
            item?.subscription_key ||
            item?.subscriptionKey ||
            item?.sku ||
            item?.price_id ||
            item?.stripe_price_id ||
            item?.metadata?.product_key ||
            item?.metadata?.plan_key ||
            item?.metadata?.subscription_key ||
            ''
        );
    };

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

    // Account Status
    const [accountStatus, setAccountStatus] = useState<string>('active');
    const [accountStatusReason, setAccountStatusReason] = useState<string | null>(null);

    // Credit top-up state
    const [topUpLoading, setTopUpLoading] = useState<string | null>(null);
    const [topUpError, setTopUpError] = useState<string | null>(null);
    const [subError, setSubError] = useState<string | null>(null);

    // Download state
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});

    // Billing Portal state
    const [portalLoading, setPortalLoading] = useState(false);
    const [portalError, setPortalError] = useState<string | null>(null);

    // Refund review states
    const [refundReviews, setRefundReviews] = useState<any[]>([]);
    const [fetchingRefunds, setFetchingRefunds] = useState(false);
    const [submittingRefund, setSubmittingRefund] = useState(false);
    const [refundError, setRefundError] = useState<string | null>(null);
    const [refundSuccessMsg, setRefundSuccessMsg] = useState<string | null>(null);
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [refundReason, setRefundReason] = useState('');
    const [refundMessage, setRefundMessage] = useState('');
    const [refundCheckAck, setRefundCheckAck] = useState(false);

    // Support ticket notification state
    const [unreadTicketCount, setUnreadTicketCount] = useState(0);
    const [unreadTickets, setUnreadTickets] = useState<{ id: string; subject: string }[]>([]);
    const [autoOpenTicketId, setAutoOpenTicketId] = useState<string | null>(null);
    const [triggerNewTicket, setTriggerNewTicket] = useState(false);
    const supportSectionRef = useRef<HTMLDivElement>(null);

    const handleUnreadCount = useCallback((count: number, tickets: { id: string; subject: string }[]) => {
        setUnreadTicketCount(count);
        setUnreadTickets(tickets);
    }, []);

    // Device activations
    const [deviceActivations, setDeviceActivations] = useState<DeviceActivation[]>([]);
    const [deviceLimit, setDeviceLimit] = useState<number>(2);
    const [deactivatingDeviceId, setDeactivatingDeviceId] = useState<string | null>(null);
    const [deviceError, setDeviceError] = useState<string | null>(null);

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

    // Subscription status
    const [subStatus, setSubStatus] = useState<{
        hasStarter: boolean;
        hasPro: boolean;
        starterSub: any | null;
        proSub: any | null;
        starterExpiration: Date | null;
        proExpiration: Date | null;
    } | null>(null);

    const handleDownloadInstaller = async (downloadId: string) => {
        try {
            setDownloadingId(downloadId);
            const { data, error } = await invokeAuthenticatedFunction('generate-download', { download_id: downloadId });

            if (error || !data || !data.url) {
                console.error("Download generation failed:", error || data?.error);
                alert(`Failed to generate download: ${data?.message || data?.error || 'Unknown error'}`);
                return;
            }

            window.location.href = data.url;
        } catch (err) {
            console.error("Unexpected error during download:", err);
            alert("An unexpected error occurred while generating your download.");
        } finally {
            setDownloadingId(null);
        }
    };



    const isExpiringOrExpired = (date: Date | null): boolean => {
        if (!date) return false;
        const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        return date <= sixtyDaysFromNow;
    };
    const isExpired = (date: Date | null): boolean => {
        if (!date) return false;
        return date <= new Date();
    };

    const loadRefundReviews = async () => {
        try {
            setFetchingRefunds(true);
            setRefundError(null);
            const { data, error } = await supabase.functions.invoke('get-my-refund-reviews');
            if (error) {
                console.error("Failed to load refund reviews:", error);
                setRefundError("Failed to load refund status");
            } else if (data) {
                setRefundReviews(data);
            }
        } catch (e) {
            console.error("Failed to load refund reviews:", e);
            setRefundError("Failed to load refund status");
        } finally {
            setFetchingRefunds(false);
        }
    };

    const loadDashboard = async () => {
        // Clean up billing portal return query param
        const params = new URLSearchParams(window.location.search);
        if (params.get('billing') === 'return') {
            params.delete('billing');
            const cleanSearch = params.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`);
        }

        // Test overrides
        const targetUserId = params.get('override_user') || session.user.id;
        const targetUserEmail = params.get('override_email') || session.user.email;

        try {
            setLoading(true);
            setErrorState(null);

            const fetchWallet = supabase.from('profiles').select('credit_balance').eq('id', targetUserId).maybeSingle().then(res => res.error ? { data: null, error: res.error } : res);
            const fetchProducts = supabase.from('products').select('*');
            const fetchOrders = supabase.from('orders').select('*, order_items(*)').eq('user_id', targetUserId).order('created_at', { ascending: false });
            const fetchLicenses = supabase.from('licenses').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false });
            const fetchDownloads = supabase.from('downloads').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false });
            const fetchSubs = supabase.from('subscriptions').select('id, status, product_id, current_period_end, canceled_at, updated_at, metadata, created_at').eq('user_id', targetUserId).order('updated_at', { ascending: false }).then(res => res.error ? { data: null, error: res.error } : res);

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
            setDbProducts(fetchedProducts);
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
                // Find license status associated with this order
                const relatedLicense = fetchedLicenses.find((l: any) => l.order_id === o.id);
                const orderLicenseStatus = relatedLicense?.status || undefined;

                if (items.length === 0) {
                    mappedOrders.push({
                        orderNumber: o.order_number || o.id?.substring(0, 8) || 'Unknown',
                        productName: 'Unnamed Product',
                        amountFormatted: o.total_amount != null ? `$${parseFloat(o.total_amount).toFixed(2)}` : 'N/A',
                        paymentStatus: o.payment_status || 'Unknown',
                        deliveryStatus: o.fulfillment_status || 'Unknown',
                        purchaseDate: o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Unknown date',
                        licenseStatus: orderLicenseStatus
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
                            purchaseDate: o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Unknown date',
                            licenseStatus: orderLicenseStatus
                        });
                    });
                }
            });

            const mappedLicenses: LicenseViewModel[] = [];
            fetchedLicenses.forEach((l: any) => {
                const key = l.license_key || 'KEY-MISSING';
                const masked = key.length > 10 ? `${key.substring(0, 5)}...${key.substring(key.length - 5)}` : '••••••••••••';
                const identity = resolveIdentity('license', l.license_name, l.order_item_id, l.order_id, l.product_id, l.stripe_price_id, 'Cast Director Studio License', l);

                const normalizeStatus = (s: string | null | undefined): string => {
                    if (!s) return 'Inactive';
                    const lower = s.toLowerCase();
                    if (lower === 'active') return 'Active';
                    if (lower === 'inactive') return 'Inactive';
                    if (lower === 'refunded') return 'Refunded';
                    if (lower === 'swapped') return 'Swapped';
                    if (lower === 'revoked') return 'Revoked';
                    if (lower === 'expired') return 'Expired';
                    return 'Inactive';
                };

                mappedLicenses.push({
                    licenseName: identity.name,
                    licenseKeyFull: key,
                    licenseKeyMasked: masked,
                    status: normalizeStatus(l.status),
                    type: l.license_type || l.metadata?.license_type || 'Perpetual',
                    issuedOn: l.issued_on ? new Date(l.issued_on).toLocaleDateString() : (l.created_at ? new Date(l.created_at).toLocaleDateString() : 'Unknown date'),
                    assignedTo: l.assigned_to || targetUserEmail || 'Unknown',
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
                const pk = prod?.product_key || l.metadata?.product_key;
                return pk === 'indie_desktop_byok' && l.status?.toLowerCase() === 'active';
            });
            const agencyLic = fetchedLicenses.find((l: any) => {
                const prod = productsMap.get(l.product_id);
                const pk = prod?.product_key || l.metadata?.product_key;
                return (pk === 'agency_desktop_byok' || pk === 'agency_commercial_byok') && l.status?.toLowerCase() === 'active';
            });

            const mappedDownloads: DownloadViewModel[] = [];
            for (const [identityStr, tokens] of Array.from(downloadGroups.entries())) {
                tokens.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
                const now = new Date();
                const validTokens = tokens.filter(t => t.expires_at && new Date(t.expires_at) > now);
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
                    canGenerateNewLink: false,
                    isAvailable
                });
            }

            const hasActiveByok = !!(indieLic || agencyLic);
            const hasWindowsInstaller = mappedDownloads.some(dl => {
                const platform = String(dl.platform ?? '').toLowerCase();
                const fileType = String(dl.fileType ?? '').toLowerCase();
                const productName = String(dl.productName ?? '').toLowerCase();
                return (
                    platform.includes('windows') ||
                    platform.includes('win') ||
                    fileType.includes('exe') ||
                    fileType.includes('installer') ||
                    productName.includes('windows')
                );
            });

            if (hasActiveByok && !hasWindowsInstaller) {
                mappedDownloads.push({
                    id: 'byok-windows-installer',
                    productName: 'Cast Director Studio Windows Installer',
                    platform: 'windows',
                    version: '1.0.0',
                    fileType: 'installer',
                    expiresAt: undefined,
                    canGenerateNewLink: true,
                    isAvailable: false
                });
            }

            setCredits(walletRes.data?.credit_balance ?? null);

            // Fetch account status separately — columns may not exist if migration hasn't run yet
            try {
                const { data: statusRes } = await supabase.from('profiles').select('account_status, account_status_reason').eq('id', targetUserId).maybeSingle();
                if (statusRes) {
                    setAccountStatus(statusRes.account_status || 'active');
                    setAccountStatusReason(statusRes.account_status_reason || null);
                }
            } catch (e) {
                // Safe to ignore — columns may not exist yet
            }
            setOrders(mappedOrders.length > 0 ? mappedOrders : null);
            setLicenses(mappedLicenses.length > 0 ? mappedLicenses : null);

            if (downloadsRes.error) {
                console.error("Failed to load downloads data:", downloadsRes.error);
                setDownloads(null);
            } else {
                setDownloads(mappedDownloads);
            }
            setSubscriptions(subsRes.data ?? null);

            setByokStatus({
                hasIndie: !!indieLic,
                hasAgency: !!agencyLic,
                indieLicense: indieLic || null,
                agencyLicense: agencyLic || null,
                indieExpiration: getByokExpiration(indieLic),
                agencyExpiration: getByokExpiration(agencyLic),
            });

            // Analyze Subscriptions.
            // Normalize the stored canonical product key (subscription_starter /
            // subscription_pro, written by the webhook into metadata) to the UI
            // plan ('starter' | 'pro'). Does not depend on the products catalog.
            const resolveSubKey = (sub: any) => {
                const rawKey = sub.metadata?.product_key || productsMap.get(sub.product_id)?.product_key || null;
                return resolveSubscriptionPlanKey(rawKey);
            };

            const activeSubsList = subsRes.data || [];
            const starterSub = activeSubsList.find((s: any) => s.status === 'active' && resolveSubKey(s) === 'starter');
            const proSub = activeSubsList.find((s: any) => s.status === 'active' && resolveSubKey(s) === 'pro');

            setSubStatus({
                hasStarter: !!starterSub,
                hasPro: !!proSub,
                starterSub: starterSub || null,
                proSub: proSub || null,
                starterExpiration: starterSub?.current_period_end ? new Date(starterSub.current_period_end) : null,
                proExpiration: proSub?.current_period_end ? new Date(proSub.current_period_end) : null,
            });

            // Fetch device activations
            try {
                const { data: activations } = await supabase
                    .from('device_activations')
                    .select('*')
                    .eq('user_id', targetUserId)
                    .order('first_activated_at', { ascending: false });

                if (activations) {
                    setDeviceActivations(activations);
                }

                // Determine device limit from strongest license
                const activeLicensesList = fetchedLicenses.filter((l: any) => l.status?.toLowerCase() === 'active');
                const bestLicense = activeLicensesList
                    .sort((a: any, b: any) => getActivationLimit(b) - getActivationLimit(a))[0];
                if (bestLicense) {
                    setDeviceLimit(getActivationLimit(bestLicense));
                }
            } catch (e) {
                console.warn('[Dashboard] device_activations fetch failed (table may not exist yet):', e);
            }

            const lacksData = fetchedOrders.length === 0 && fetchedLicenses.length === 0 && fetchedDownloads.length === 0;
            if (lacksData && targetUserEmail) {
                const guestCheck = await supabase.from('orders').select('id').eq('customer_email', targetUserEmail).is('user_id', null).limit(1).maybeSingle();
                if (guestCheck.data) setHasGuestPurchases(true);
            }

            await loadRefundReviews();
        } catch (err) {
            console.error("Dashboard massive structural failure:", err);
            setErrorState("An unexpected error occurred while loading your dashboard. Please check console for details.");
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshDownloadLink = useCallback(async (downloadId: string) => {
        setRefreshingId(downloadId);
        setRefreshErrors((prev) => {
            const next = { ...prev };
            delete next[downloadId];
            return next;
        });

        try {
            const { data, error } = await invokeAuthenticatedFunction('refresh-download-link', { downloadId });

            if (error || !data || !data.success) {
                console.error("Download refresh failed:", error || data?.error);
                throw new Error(data?.message || data?.error || 'Could not refresh download link. Please contact support.');
            }

            if (downloadId === 'byok-windows-installer') {
                await loadDashboard();
            } else {
                // Update the local downloads/dashboard state with the refreshed expiresAt and availability
                setDownloads((prev) => {
                    if (!prev) return prev;
                    return prev.map((dl) => {
                        if (dl.id === downloadId) {
                            return {
                                ...dl,
                                expiresAt: data.expiresAt,
                                isAvailable: true,
                            };
                        }
                        return dl;
                    });
                });
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            let message = 'Could not refresh download link. Please contact support.';

            if (errMsg === 'eligible_order_not_found') {
                message = 'We could not find an eligible purchase order associated with your BYOK license to generate a download link. Please claim guest purchases or contact support.';
            } else if (errMsg === 'no_active_byok_license') {
                message = 'An active BYOK desktop license is required to generate this download link.';
            } else if (errMsg === 'installer_not_found' || errMsg === 'DOWNLOAD_NOT_FOUND') {
                message = 'The official Windows installer file could not be found on the download server.';
            } else if (errMsg === 'refresh_failed') {
                message = 'The download link generation failed on the server. Please try again or contact support.';
            } else {
                message = errMsg;
            }

            setRefreshErrors((prev) => ({
                ...prev,
                [downloadId]: message,
            }));
        } finally {
            setRefreshingId(null);
        }
    }, [setDownloads, loadDashboard]);


    useEffect(() => {
        // Safety net: silently invoke claim-purchases on mount to link any
        // pending guest purchases to this authenticated user before loading data.
        const claimAndLoad = async () => {
            try {
                await invokeAuthenticatedFunction('claim-purchases', {});
            } catch (err) {
                // Non-blocking — claim is a best-effort safety net
                console.warn('[Dashboard] claim-purchases safety net failed:', err);
            }
            loadDashboard();
        };
        claimAndLoad();
    }, [session.user.id, session.user.email, window.location.search]);

    // ── Credit Top-Up Checkout ──
    // Uses productKey-only contract — the Edge Function resolves the Stripe price server-side.
    // Credit packs always require authentication so the webhook can credit the user's balance.
    const handleTopUp = async (packKey: 'credit_pack_100' | 'credit_pack_500') => {
        setTopUpLoading(packKey);
        setTopUpError(null);

        try {
            // 1. Require a valid session — no guest checkout for credit top-ups
            const { data: { session: activeSession } } = await supabase.auth.getSession();
            if (!activeSession?.access_token) {
                setTopUpError('Please sign in again before purchasing credits.');
                return;
            }

            // 2. Build request
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
            const functionUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;

            const successUrl = `${window.location.origin}/get-started#session_id={CHECKOUT_SESSION_ID}&type=topup`;
            const cancelUrl = `${window.location.origin}/#pricing`;

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${activeSession.access_token}`,
                    ...getAffiliateAttributionHeaders(),
                },
                body: JSON.stringify(withAffiliateAttributionBody({
                    productKey: packKey,
                    successUrl,
                    cancelUrl,
                })),
            });

            let responseBody: any = null;
            try {
                responseBody = await response.json();
            } catch {
                responseBody = await response.text();
            }

            if (!response.ok) {
                console.error('Credit top-up checkout rejected:', {
                    status: response.status,
                    responseBody,
                    packKey,
                });
                const serverMessage = responseBody?.message || responseBody?.error || `Checkout failed with status ${response.status}`;
                throw new Error(serverMessage);
            }

            if (responseBody?.url) {
                window.location.href = responseBody.url;
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
            const returnUrl = `${window.location.origin}/get-started#session_id={CHECKOUT_SESSION_ID}&type=${successType}`;

            const catalogEntry = resolveCatalogEntryFromDbProduct(product);

            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                headers: getAffiliateAttributionHeaders(),
                body: withAffiliateAttributionBody({
                    priceId: product.stripe_price_id,
                    mode: catalogEntry?.checkoutMode || 'payment',
                    productKey: productKey,
                    successUrl: returnUrl,
                    cancelUrl: `${window.location.origin}/#pricing`,
                })
            });

            if (error) {
                let parsedMsg = error.message || 'Checkout failed';
                let isDuplicate = false;
                try {
                    if (error.context && typeof error.context.json === 'function') {
                        const body = await error.context.json();
                        parsedMsg = body.message || body.error || parsedMsg;
                        if (body.code === 'duplicate_purchase') isDuplicate = true;
                    } else if (error.message?.includes('already own')) {
                        isDuplicate = true;
                    }
                } catch (e) { /* ignore parse error */ }

                if (isDuplicate) {
                    setByokError(parsedMsg !== 'Edge Function returned a non-2xx status code' ? parsedMsg : 'You already own this product.');
                } else {
                    throw new Error(parsedMsg);
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

    // ── Hosted Subscription Checkout ──
    // Authoritative contract: send a productKey ONLY (subscription_starter /
    // subscription_pro). The Edge Function derives the Stripe price, the monthly
    // amount, and the paid-credit grant server-side from that key — the browser
    // never sends a price id, mode, or credit amount. Auth is mandatory.
    const handleSubscriptionCheckout = async (plan: SubscriptionPlan) => {
        setTopUpLoading(plan);
        setSubError(null);

        try {
            const { data: { session: activeSession } } = await supabase.auth.getSession();
            if (!activeSession?.access_token) {
                setSubError('Please sign in to continue.');
                return;
            }

            const returnUrl = `${window.location.origin}/get-started#session_id={CHECKOUT_SESSION_ID}&type=hosted`;

            const { url } = await startSubscriptionCheckout({
                plan,
                accessToken: activeSession.access_token,
                returnUrl,
                supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
                supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                extraHeaders: getAffiliateAttributionHeaders(),
            });

            window.location.href = url;
        } catch (err: any) {
            if (err instanceof SubscriptionAuthRequiredError) {
                setSubError('Please sign in to continue.');
            } else {
                setSubError(err.message || 'An unexpected error occurred during checkout.');
            }
        } finally {
            setTopUpLoading(null);
        }
    };

    // ── Device Deactivation ──
    const handleDeactivateDevice = async (activationId: string) => {
        setDeactivatingDeviceId(activationId);
        setDeviceError(null);

        try {
            const { data: { session: activeSession } } = await supabase.auth.getSession();
            if (!activeSession?.access_token) {
                setDeviceError('Please sign in to manage devices.');
                return;
            }

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
            const functionUrl = `${supabaseUrl}/functions/v1/deactivate-device`;

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${activeSession.access_token}`,
                },
                body: JSON.stringify({ activationId }),
            });

            const responseBody = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(responseBody?.error || `Deactivation failed (${response.status})`);
            }

            // Update local state
            setDeviceActivations(prev => prev.map(d =>
                d.id === activationId
                    ? { ...d, status: 'deactivated', deactivated_at: new Date().toISOString() }
                    : d
            ));
        } catch (err: any) {
            console.error('Device deactivation failed:', err);
            setDeviceError(err.message || 'Failed to deactivate device.');
        } finally {
            setDeactivatingDeviceId(null);
        }
    };

    // ── Stripe Billing Portal ──
    const handleBillingPortal = async () => {
        setPortalLoading(true);
        setPortalError(null);

        try {
            const { data: { session: activeSession } } = await supabase.auth.getSession();
            if (!activeSession?.access_token) {
                setPortalError('Please sign in to manage your subscription.');
                return;
            }

            const { data, error: invokeErr } = await supabase.functions.invoke('create-billing-portal-session', {
                body: {}
            });

            if (invokeErr) {
                let parsedMsg = invokeErr.message || 'Failed to open billing portal';
                try {
                    if (invokeErr.context && typeof invokeErr.context.json === 'function') {
                        const body = await invokeErr.context.json();
                        parsedMsg = body.error || parsedMsg;
                    }
                } catch (e) { /* ignore parse error */ }
                throw new Error(parsedMsg);
            }

            if (data?.error) throw new Error(data.error);

            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error('Billing portal URL was not returned.');
            }
        } catch (err: any) {
            console.error('Billing portal error:', err);
            setPortalError(err.message || 'An unexpected error occurred.');
        } finally {
            setPortalLoading(false);
        }
    };

    const dedupedDownloads = (() => {
        if (!downloads) return null;

        const safeDownloads = Array.isArray(downloads) ? downloads : [];

        const isWindowsInstallerDownload = (download: DownloadViewModel) => {
            const platform = String(download?.platform ?? '').toLowerCase();
            const fileType = String(download?.fileType ?? (download as any).file_type ?? '').toLowerCase();
            const productName = String(download?.productName ?? (download as any).product_name ?? '').toLowerCase();
            const installerPlatform = String((download as any).installer_platform ?? '').toLowerCase();

            return (
                platform.includes('windows') ||
                platform.includes('win') ||
                installerPlatform.includes('windows') ||
                fileType.includes('exe') ||
                fileType.includes('installer') ||
                productName.includes('windows')
            );
        };

        const isExpiredDownload = (download: DownloadViewModel) => {
            const expiresAt = download?.expiresAt || (download as any).expires_at;
            return expiresAt ? new Date(expiresAt).getTime() <= Date.now() : true;
        };

        // Separate Windows installers from others
        const windowsDownloads = safeDownloads.filter(isWindowsInstallerDownload);
        const otherDownloads = safeDownloads.filter(dl => !isWindowsInstallerDownload(dl));

        const result: DownloadViewModel[] = [];

        if (windowsDownloads.length > 0) {
            const bestWindowsDownload = [...windowsDownloads].sort((a, b) => {
                const aIsSynthesized = a.id === 'byok-windows-installer';
                const bIsSynthesized = b.id === 'byok-windows-installer';
                if (aIsSynthesized !== bIsSynthesized) return aIsSynthesized ? 1 : -1;

                const aExpired = !a.isAvailable || isExpiredDownload(a);
                const bExpired = !b.isAvailable || isExpiredDownload(b);

                if (aExpired !== bExpired) return aExpired ? 1 : -1;

                const aHasStorage = Boolean((a as any).storage_path || (a as any).storagePath);
                const bHasStorage = Boolean((b as any).storage_path || (b as any).storagePath);
                if (aHasStorage !== bHasStorage) return aHasStorage ? -1 : 1;

                const aHasSize = Boolean((a as any).file_size_bytes || (a as any).fileSizeBytes);
                const bHasSize = Boolean((b as any).file_size_bytes || (b as any).fileSizeBytes);
                if (aHasSize !== bHasSize) return aHasSize ? -1 : 1;

                const dateA = a.expiresAt || (a as any).expires_at || '';
                const dateB = b.expiresAt || (b as any).expires_at || '';
                const timeA = dateA ? new Date(dateA).getTime() : 0;
                const timeB = dateB ? new Date(dateB).getTime() : 0;
                return timeB - timeA;
            })[0];

            if (bestWindowsDownload) {
                result.push(bestWindowsDownload);
            }
        }

        // Deduplicate non-Windows downloads by installer_id or key
        const otherGroups: Record<string, DownloadViewModel[]> = {};
        otherDownloads.forEach((dl) => {
            const installerId = (dl as any).installer_id || (dl as any).installerId || '';
            const groupKey = installerId || `${String(dl.platform ?? '').toLowerCase()}-${String(dl.version ?? '').toLowerCase()}-${String(dl.fileType ?? '').toLowerCase()}`;

            if (!otherGroups[groupKey]) {
                otherGroups[groupKey] = [];
            }
            otherGroups[groupKey].push(dl);
        });

        Object.values(otherGroups).forEach((group) => {
            const bestOther = group.sort((a, b) => {
                if (a.isAvailable && !b.isAvailable) return -1;
                if (!a.isAvailable && b.isAvailable) return 1;

                const dateA = a.expiresAt || (a as any).expires_at || '';
                const dateB = b.expiresAt || (b as any).expires_at || '';
                const timeA = dateA ? new Date(dateA).getTime() : 0;
                const timeB = dateB ? new Date(dateB).getTime() : 0;
                return timeB - timeA;
            })[0];

            if (bestOther) {
                result.push(bestOther);
            }
        });

        return result;
    })();

    return (
        <section id="account-dashboard" className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
            <div className="container mx-auto px-6">
                <div className="max-w-5xl mx-auto">

                    {/* Header */}
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <h2 className="text-3xl md:text-4xl font-bold mb-2">Account Dashboard</h2>
                            <p className="text-nano-text">
                                Signed in as {displayEmail}
                            </p>
                        </div>
                        {unreadTicketCount === 0 && (
                            <button
                                onClick={() => {
                                    // Scroll to the support section first
                                    const el = supportSectionRef.current;
                                    if (el) {
                                        const rect = el.getBoundingClientRect();
                                        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                                        const navbarHeight = 100;
                                        window.scrollTo({ top: rect.top + scrollTop - navbarHeight, behavior: 'smooth' });
                                    }
                                    // Trigger the new ticket modal in SupportTickets
                                    setTriggerNewTicket(true);
                                    setTimeout(() => setTriggerNewTicket(false), 500);
                                }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-nano-yellow text-black text-xs font-bold uppercase tracking-wide hover:bg-nano-gold transition-all duration-200 rounded-sm flex-shrink-0 mt-1"
                            >
                                <LifeBuoy size={15} />
                                Open a Support Ticket
                            </button>
                        )}
                    </div>

                    {/* Support Ticket Notification Banner */}
                    {unreadTicketCount > 0 && (
                        <button
                            onClick={() => {
                                const firstUnread = unreadTickets[0];
                                if (firstUnread) {
                                    setAutoOpenTicketId(firstUnread.id);
                                    // Reset after a tick so re-clicking works
                                    setTimeout(() => setAutoOpenTicketId(null), 500);
                                }
                            }}
                            className="w-full mb-6 flex items-center gap-3 px-5 py-3.5 rounded-sm border border-nano-yellow/40 bg-nano-yellow/[0.06] hover:bg-nano-yellow/[0.12] transition-all duration-200 group cursor-pointer text-left"
                        >
                            <div className="relative flex-shrink-0">
                                <MessageSquare size={20} className="text-nano-yellow" />
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-nano-yellow text-black text-[9px] font-black rounded-full flex items-center justify-center">
                                    {unreadTicketCount}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-white group-hover:text-nano-yellow transition-colors">
                                    {unreadTicketCount === 1 ? 'You have a new support reply' : `You have ${unreadTicketCount} unread support replies`}
                                </div>
                                <div className="text-[11px] text-nano-text/70 truncate mt-0.5">
                                    {unreadTickets[0]?.subject}
                                    {unreadTicketCount > 1 && ` and ${unreadTicketCount - 1} more`}
                                </div>
                            </div>
                            <span className="text-[10px] text-nano-yellow/70 uppercase tracking-widest font-bold flex-shrink-0 group-hover:text-nano-yellow transition-colors">
                                View →
                            </span>
                        </button>
                    )}

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
                            {/* Account Status Banner */}
                            {accountStatus === 'paused' && (
                                <div className="rounded-sm border border-amber-500/50 bg-amber-500/10 p-6 mb-8">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
                                        <h3 className="text-amber-400 font-bold text-lg">Account Paused</h3>
                                    </div>
                                    <p className="text-amber-200 text-sm">
                                        Your account is currently paused.{accountStatusReason ? ` Reason: ${accountStatusReason}.` : ''} Please contact support for assistance.
                                    </p>
                                    <a href="#support-tickets" className="inline-block mt-3 text-xs uppercase tracking-wider font-bold text-amber-400 hover:text-amber-300 transition-colors">
                                        Contact Support →
                                    </a>
                                </div>
                            )}
                            {accountStatus === 'canceled' && (
                                <div className="rounded-sm border border-red-500/50 bg-red-500/10 p-6 mb-8">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-3 h-3 bg-red-400 rounded-full" />
                                        <h3 className="text-red-400 font-bold text-lg">Account Canceled</h3>
                                    </div>
                                    <p className="text-red-200 text-sm">
                                        Your account has been canceled.{accountStatusReason ? ` Reason: ${accountStatusReason}.` : ''} Please contact support if you believe this is an error.
                                    </p>
                                    <a href="#support-tickets" className="inline-block mt-3 text-xs uppercase tracking-wider font-bold text-red-400 hover:text-red-300 transition-colors">
                                        Contact Support →
                                    </a>
                                </div>
                            )}
                            {/* Dashboard Level Recovery Action */}
                            {hasGuestPurchases && (
                                <div className="mb-8 rounded-sm border border-nano-yellow/50 bg-nano-yellow/10 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-xl font-bold text-nano-yellow mb-1">Unclaimed Purchases Found</h3>
                                        <p className="text-sm text-nano-text">
                                            We found guest purchases associated with <strong>{displayEmail}</strong> that aren't linked to your account yet.
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

                            {showRefundModal && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                                    <div className="relative w-full max-w-lg rounded-2xl bg-gradient-to-b from-slate-950 via-[#0d1324] to-[#161f36] border border-white/[0.08] shadow-2xl p-6 md:p-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

                                        <div className="flex justify-between items-start mb-6">
                                            <h3 className="text-xl font-bold text-white font-display">Fit Guarantee Refund Request</h3>
                                            <button
                                                onClick={() => setShowRefundModal(false)}
                                                className="text-slate-400 hover:text-white transition-colors"
                                                aria-label="Close modal"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <p className="text-sm text-slate-300 leading-relaxed">
                                                We want you to love Cast Director Studio. Under our <strong>7-Day Fit Guarantee</strong>, you can cancel your subscription and receive a refund.
                                            </p>

                                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
                                                <div className="flex items-start gap-2.5 text-xs text-slate-400">
                                                    <span className="text-red-400 mt-0.5">✦</span>
                                                    <span>Used credits are non-refundable and will be deducted from your refund amount.</span>
                                                </div>
                                                <div className="flex items-start gap-2.5 text-xs text-slate-400">
                                                    <span className="text-red-400 mt-0.5">✦</span>
                                                    <span>Remaining subscription credits will be immediately revoked if the refund is approved.</span>
                                                </div>
                                                <div className="flex items-start gap-2.5 text-xs text-slate-400">
                                                    <span className="text-red-400 mt-0.5">✦</span>
                                                    <span>Final review and processing is handled by an administrator within 3-5 business days.</span>
                                                </div>
                                            </div>

                                            {refundError && (
                                                <div className="p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-xs rounded-lg">
                                                    {refundError}
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">
                                                    Reason for Cancellation (Optional)
                                                </label>
                                                <textarea
                                                    value={refundReason}
                                                    onChange={(e) => {
                                                        setRefundReason(e.target.value);
                                                        setRefundMessage(e.target.value);
                                                    }}
                                                    placeholder="Tell us what didn't fit, so we can improve..."
                                                    className="w-full h-24 p-3 bg-black/40 border border-white/[0.08] focus:border-red-500/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-colors resize-none"
                                                />
                                            </div>

                                            <label className="flex items-start gap-3 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={refundCheckAck}
                                                    onChange={(e) => setRefundCheckAck(e.target.checked)}
                                                    className="mt-1 accent-red-500"
                                                />
                                                <span className="text-xs text-slate-400 leading-normal">
                                                    I understand that used hosted credits are not refundable and that remaining monthly subscription credits will be revoked if this refund is approved.
                                                </span>
                                            </label>
                                        </div>

                                        <div className="flex justify-end gap-3">
                                            <button
                                                onClick={() => setShowRefundModal(false)}
                                                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider rounded-full transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!refundCheckAck) {
                                                        setRefundError("Please acknowledge the refund terms by checking the box.");
                                                        return;
                                                    }
                                                    setSubmittingRefund(true);
                                                    setRefundError(null);
                                                    try {
                                                        const { data, error } = await supabase.functions.invoke('request-refund-review', {
                                                            body: {
                                                                reason: refundReason,
                                                                customer_message: refundMessage
                                                            }
                                                        });
                                                        if (error) {
                                                            let errMsg = error.message || "Failed to submit request.";
                                                            try {
                                                                if (error.context && typeof error.context.json === 'function') {
                                                                    const body = await error.context.json();
                                                                    errMsg = body.message || body.error || errMsg;
                                                                }
                                                            } catch {}
                                                            throw new Error(errMsg);
                                                        }
                                                        setRefundSuccessMsg(data?.message || "Refund request submitted successfully.");
                                                        setShowRefundModal(false);
                                                        await loadDashboard(); // refresh data & reload state
                                                    } catch (err: any) {
                                                        setRefundError(err.message || "Failed to request refund review.");
                                                    } finally {
                                                        setSubmittingRefund(false);
                                                    }
                                                }}
                                                disabled={submittingRefund}
                                                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-full transition-all flex items-center gap-2"
                                            >
                                                {submittingRefund && <Loader2 size={14} className="animate-spin" />}
                                                Submit Request
                                            </button>
                                        </div>
                                    </div>
                                </div>
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
                                        {licenses ? licenses.filter(l => l.status === 'Active').length : 0}
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



                            {/* Dual Ownership Banner — show when user has both Hosted + BYOK */}
                            {(subStatus?.hasStarter || subStatus?.hasPro) && (byokStatus?.hasIndie || byokStatus?.hasAgency) && (
                                <div className="mb-12 rounded-sm border border-nano-yellow/30 bg-nano-yellow/5 p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-nano-yellow/20 flex items-center justify-center mt-0.5">
                                            <span className="text-nano-yellow text-lg">⚡</span>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-white font-bold mb-1">Managed API + BYOK Desktop Active</h3>
                                            <p className="text-sm text-nano-text leading-relaxed">
                                                You have both Managed API credits and a BYOK Desktop license. BYOK may save money for high-volume generation, but your Hosted credits remain available.
                                            </p>
                                            <div className="flex flex-wrap gap-3 mt-4">
                                                <a
                                                    href="#hosted-subscriptions"
                                                    className="px-4 py-2 bg-white/10 text-white font-bold text-xs uppercase tracking-wide hover:bg-white/20 transition-all rounded-sm"
                                                >
                                                    Manage Hosted Subscription
                                                </a>
                                                <a
                                                    href="#byok-license"
                                                    className="px-4 py-2 bg-nano-yellow/20 text-nano-yellow font-bold text-xs uppercase tracking-wide hover:bg-nano-yellow/30 transition-all rounded-sm"
                                                >
                                                    View BYOK License
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

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

                            {/* Hosted Subscriptions Section */}
                            {subStatus && (
                                <div id="hosted-subscriptions" className="mb-12 rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                    <h3 className="text-lg font-bold mb-4">Hosted Subscriptions</h3>
                                    {subError && (
                                        <div className="mb-4 p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-sm rounded-sm">
                                            {subError}
                                        </div>
                                    )}

                                    {subStatus.hasPro ? (
                                        <>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Plan</div>
                                                    <div className="text-white font-medium">Pro</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Status</div>
                                                    <div className="text-green-400 font-medium">Active</div>
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Renews On</div>
                                                    <div className="text-white font-medium">
                                                        {subStatus.proExpiration ? subStatus.proExpiration.toLocaleDateString() : 'Unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-nano-border/30">
                                                <button
                                                    onClick={handleBillingPortal}
                                                    disabled={portalLoading}
                                                    className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-white/20 transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {portalLoading && <Loader2 size={14} className="animate-spin" />}
                                                    Manage Subscription
                                                </button>
                                            </div>
                                            {portalError && (
                                                <div className="mt-3 p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-sm rounded-sm">
                                                    {portalError}
                                                </div>
                                            )}
                                        </>
                                    ) : subStatus.hasStarter ? (
                                        <>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Plan</div>
                                                    <div className="text-white font-medium">Starter</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Status</div>
                                                    <div className="text-green-400 font-medium">Active</div>
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Renews On</div>
                                                    <div className="text-white font-medium">
                                                        {subStatus.starterExpiration ? subStatus.starterExpiration.toLocaleDateString() : 'Unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-nano-border/30">
                                                <button
                                                    onClick={handleBillingPortal}
                                                    disabled={portalLoading}
                                                    className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-white/20 transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {portalLoading && <Loader2 size={14} className="animate-spin" />}
                                                    Manage Subscription
                                                </button>
                                                <button
                                                    onClick={() => handleSubscriptionCheckout('pro')}
                                                    disabled={!!topUpLoading}
                                                    className="px-6 py-3 bg-nano-yellow text-black font-bold text-sm uppercase tracking-wide hover:bg-nano-gold transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {topUpLoading === 'pro' && <Loader2 size={14} className="animate-spin" />}
                                                    Upgrade to Pro — $119/month
                                                </button>
                                            </div>
                                            {portalError && (
                                                <div className="mt-3 p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-sm rounded-sm">
                                                    {portalError}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm text-nano-text mb-4">
                                                You do not have an active hosted subscription. Choose a plan to get monthly credits.
                                            </p>
                                            <div className="flex flex-wrap gap-4">
                                                <button
                                                    onClick={() => handleSubscriptionCheckout('starter')}
                                                    disabled={!!topUpLoading}
                                                    className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {topUpLoading === 'starter' && <Loader2 size={14} className="animate-spin" />}
                                                    Buy Starter — $59/month
                                                </button>
                                                <button
                                                    onClick={() => handleSubscriptionCheckout('pro')}
                                                    disabled={!!topUpLoading}
                                                    className="px-6 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {topUpLoading === 'pro' && <Loader2 size={14} className="animate-spin" />}
                                                    Buy Pro — $119/month
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Billing & Refunds Section */}
                            <div id="billing-refunds" className="mb-12 rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                <h3 className="text-lg font-bold mb-4 font-display text-white">Billing & Refunds</h3>

                                {refundError ? (
                                    <div className="p-4 border border-red-500/20 bg-red-950/20 rounded-sm text-sm text-red-400">
                                        <p className="font-semibold">Refund status could not be loaded. Please refresh or contact support.</p>
                                    </div>
                                ) : fetchingRefunds ? (
                                    <div className="flex items-center gap-3 py-4 text-sm text-nano-text/75">
                                        <Loader2 className="animate-spin text-nano-yellow" size={16} />
                                        <span>Checking refund eligibility...</span>
                                    </div>
                                ) : (
                                    <>
                                        {/* Refund reviews history/status tracker */}
                                        {refundReviews.length > 0 && (
                                            <div className="mb-6">
                                                <h4 className="text-sm font-bold text-white mb-3">Refund Request Status</h4>
                                                <div className="space-y-4">
                                                    {refundReviews.map((rev) => (
                                                        <div key={rev.id} className="p-4 bg-black/30 border border-nano-border/50 text-sm rounded-sm">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div>
                                                                    <strong className="text-white block capitalize font-display">{rev.plan_key} Subscription Refund</strong>
                                                                    <span className="text-xs text-nano-text/60">Requested on {new Date(rev.created_at).toLocaleDateString()}</span>
                                                                </div>
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-wide border ${
                                                                    rev.status === 'pending' ? 'bg-amber-950/40 text-amber-400 border-amber-500/30' :
                                                                    rev.status === 'approved' || rev.status === 'refunded' ? 'bg-green-950/40 text-green-400 border-green-500/30' :
                                                                    'bg-red-950/40 text-red-400 border-red-500/30'
                                                                }`}>
                                                                    {rev.status}
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 pt-3 border-t border-nano-border/30 text-xs">
                                                                <div>
                                                                    <span className="text-nano-text/60 block">Credits Used</span>
                                                                    <span className="text-white font-medium">{rev.credits_used}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-nano-text/60 block">Used Credit Cost</span>
                                                                    <span className="text-white font-medium">${(rev.used_credit_cost_cents / 100).toFixed(2)}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-nano-text/60 block">Credits to Revoke</span>
                                                                    <span className="text-white font-medium">{rev.remaining_credits_to_revoke ?? 0}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-nano-text/60 block">Refund Estimate</span>
                                                                    <span className="text-nano-yellow font-bold">${(rev.refundable_amount_cents / 100).toFixed(2)}</span>
                                                                </div>
                                                            </div>
                                                            {rev.reason && (
                                                                <div className="mt-3 text-xs text-nano-text bg-black/20 p-2 rounded-sm leading-relaxed">
                                                                    <strong>Reason:</strong> {rev.reason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* State logic for hosted subscription eligibility */}
                                        {(() => {
                                            const activeHostedSub = subscriptions?.find(s => s.status === 'active' && ['starter', 'pro'].includes(resolveSubKey(s)));
                                            const activeReviewExists = refundReviews.some(r => ['pending', 'approved', 'refunded'].includes(r.status));

                                            if (!activeHostedSub) {
                                                // If there are no existing refund reviews, show the No Hosted Sub message
                                                if (refundReviews.length === 0) {
                                                    return (
                                                        <div className="text-sm text-nano-text leading-relaxed">
                                                            Refund reviews are available for hosted subscription plans. BYOK licenses and delivered credit packs are handled under their own purchase terms.
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }

                                            // If there is an active review already in progress/complete, don't show the request button or ineligible message
                                            if (activeReviewExists) {
                                                return null;
                                            }

                                            const createdTime = activeHostedSub.created_at ? new Date(activeHostedSub.created_at).getTime() : 0;
                                            const isWithin7Days = createdTime > 0 ? (Date.now() - createdTime) <= 7 * 24 * 60 * 60 * 1000 : false;

                                            if (isWithin7Days && !activeHostedSub.canceled_at) {
                                                return (
                                                    <div className="mt-4 pt-4 border-t border-nano-border/30">
                                                        <div className="p-4 border border-nano-yellow/20 bg-nano-yellow/[0.03] rounded-sm mb-4">
                                                            <h4 className="text-sm font-bold text-nano-yellow mb-1 font-display">7-Day Fit Guarantee Active</h4>
                                                            <p className="text-xs text-nano-text leading-relaxed">
                                                                You are within the 7-day satisfaction window. If the service isn't a fit, you can cancel your plan and request a refund review. Used credits will be deducted from your refund.
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setRefundError(null);
                                                                setRefundSuccessMsg(null);
                                                                setRefundCheckAck(false);
                                                                setRefundReason('');
                                                                setRefundMessage('');
                                                                setShowRefundModal(true);
                                                            }}
                                                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm uppercase tracking-wide transition-all rounded-sm font-display"
                                                        >
                                                            Cancel Plan and Request Fit Guarantee Refund
                                                        </button>
                                                        <p className="text-xs text-nano-text/60 mt-3 leading-relaxed">
                                                            Used hosted credits are not refundable and will be deducted from your estimated refund.
                                                        </p>
                                                    </div>
                                                );
                                            } else {
                                                return (
                                                    <div className="p-4 border border-nano-border/50 bg-black/10 rounded-sm text-sm text-nano-text leading-relaxed">
                                                        <strong className="text-white block mb-1">No active Fit Guarantee refund window is available for this subscription.</strong>
                                                        <p className="text-xs">
                                                            The 7-Day Fit Guarantee applies to the first 7 days after the initial hosted subscription purchase. You can still manage or cancel your subscription from the subscription management section above.
                                                        </p>
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </>
                                )}
                            </div>

                            {/* BYOK Desktop License Section */}
                            {byokStatus && (
                                <div id="byok-license" className="mb-12 rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                    {byokStatus.hasAgency ? (
                                        <>
                                            <h3 className="text-lg font-bold mb-4">Desktop License — Agency Commercial BYOK</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Status</div>
                                                    <div className="text-white font-medium">Active</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Devices</div>
                                                    <div className="text-white font-medium">
                                                        {deviceActivations.filter(d => d.license_id === byokStatus.agencyLicense?.id && d.status === 'active').length} of {getActivationLimit(byokStatus.agencyLicense)} activated
                                                    </div>
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
                                                    <div className="text-xs text-nano-text uppercase tracking-wide mb-1">Devices</div>
                                                    <div className="text-white font-medium">
                                                        {deviceActivations.filter(d => d.license_id === byokStatus.indieLicense?.id && d.status === 'active').length} of {getActivationLimit(byokStatus.indieLicense)} activated
                                                    </div>
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
                                            <p className="text-sm text-nano-text mb-6">
                                                Generate often? BYOK Desktop is the lower-cost path for high-volume creators who want to use their own Google/Vertex API key and pay the AI provider directly.
                                            </p>
                                            <div className="grid md:grid-cols-2 gap-4">
                                                {/* Indie BYOK Card */}
                                                <div className="border border-nano-border/50 rounded-sm bg-black/20 p-5 flex flex-col">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-white font-bold text-sm uppercase tracking-wide">Indie Desktop BYOK</h4>
                                                        <span className="text-nano-yellow font-bold text-sm">$199</span>
                                                    </div>
                                                    <details className="group mb-4">
                                                        <summary className="flex items-center gap-1.5 text-xs text-nano-text cursor-pointer hover:text-white focus:text-white transition-colors select-none list-none [&::-webkit-details-marker]:hidden" tabIndex={0} aria-label="View Indie BYOK plan details">
                                                            <Info size={13} className="flex-shrink-0 opacity-60 group-open:opacity-100 transition-opacity" />
                                                            <span className="group-open:hidden">View plan details</span>
                                                            <span className="hidden group-open:inline">Hide plan details</span>
                                                        </summary>
                                                        <p className="mt-2 text-xs text-nano-text/80 leading-relaxed" role="note">
                                                            Pay once for the desktop app license. No monthly Cast Director Studio credit subscription is required. Connect your own Google/Vertex API key and pay the AI provider directly for generation usage. Includes 12 months of updates and standard support. Best for solo creators, freelancers, and small creators using the app on one local device.
                                                        </p>
                                                    </details>
                                                    <div className="mt-auto">
                                                        <button
                                                            onClick={() => handleByokCheckout('indie_desktop_byok')}
                                                            disabled={!!topUpLoading}
                                                            className="w-full px-5 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                        >
                                                            {topUpLoading === 'indie_desktop_byok' && <Loader2 size={14} className="animate-spin" />}
                                                            Buy Indie — $199
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Agency BYOK Card */}
                                                <div className="border border-nano-border/50 rounded-sm bg-black/20 p-5 flex flex-col">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-white font-bold text-sm uppercase tracking-wide">Agency Commercial BYOK</h4>
                                                        <span className="text-nano-yellow font-bold text-sm">$499</span>
                                                    </div>
                                                    <details className="group mb-4">
                                                        <summary className="flex items-center gap-1.5 text-xs text-nano-text cursor-pointer hover:text-white focus:text-white transition-colors select-none list-none [&::-webkit-details-marker]:hidden" tabIndex={0} aria-label="View Agency BYOK plan details">
                                                            <Info size={13} className="flex-shrink-0 opacity-60 group-open:opacity-100 transition-opacity" />
                                                            <span className="group-open:hidden">View plan details</span>
                                                            <span className="hidden group-open:inline">Hide plan details</span>
                                                        </summary>
                                                        <p className="mt-2 text-xs text-nano-text/80 leading-relaxed" role="note">
                                                            Pay once for the Agency desktop license. No monthly Cast Director Studio credit subscription is required. Connect your own Google/Vertex API key and pay the AI provider directly for generation usage. Includes 12 months of updates and priority support. Built for agencies, studios, teams, client-facing workflows, and up to 3 local device activations.
                                                        </p>
                                                    </details>
                                                    <div className="mt-auto">
                                                        <button
                                                            onClick={() => handleByokCheckout('agency_desktop_byok')}
                                                            disabled={!!topUpLoading}
                                                            className="w-full px-5 py-3 bg-white/10 text-white font-bold text-sm uppercase tracking-wide hover:bg-nano-yellow hover:text-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                        >
                                                            {topUpLoading === 'agency_desktop_byok' && <Loader2 size={14} className="animate-spin" />}
                                                            Buy Agency — $499
                                                        </button>
                                                    </div>
                                                </div>
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

                            {/* Activated Devices Section — only visible when at least one active BYOK license exists */}
                            {(byokStatus?.hasIndie || byokStatus?.hasAgency) && (() => {
                                const activeLic = byokStatus?.agencyLicense || byokStatus?.indieLicense;
                                const limit = getActivationLimit(activeLic);
                                const activeActivations = deviceActivations.filter(d => d.status === 'active' && d.license_id === activeLic?.id);
                                return (
                                    <div id="activated-devices" className="mb-12 rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold">Activated Devices</h3>
                                            {activeActivations.length > 0 && (
                                                <span className="text-xs text-nano-text">
                                                    {activeActivations.length} of {limit} slots used
                                                </span>
                                            )}
                                        </div>

                                        {/* Usage Bar */}
                                        {activeActivations.length > 0 && (
                                            <div className="mb-5">
                                                <div className="w-full h-1.5 bg-nano-border/50 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            activeActivations.length >= limit
                                                                ? 'bg-red-400'
                                                                : 'bg-nano-yellow'
                                                        }`}
                                                        style={{ width: `${Math.min(100, (activeActivations.length / limit) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {deviceError && (
                                            <div className="mb-4 p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-sm rounded-sm">
                                                {deviceError}
                                            </div>
                                        )}

                                        {activeActivations.length === 0 ? (
                                            <div className="text-center py-8">
                                                <Monitor size={32} className="mx-auto text-nano-text/40 mb-3" />
                                                <p className="text-sm text-nano-text">
                                                    No devices activated yet. Open Cast Director Studio on your desktop to activate.
                                                </p>
                                                <p className="text-xs text-nano-text/60 mt-2">
                                                    You can activate up to {limit} device{limit !== 1 ? 's' : ''} with your current license.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {activeActivations.map((device) => {
                                                    const platformIcon = device.platform?.toLowerCase().includes('mac')
                                                        ? <Laptop size={16} className="flex-shrink-0" />
                                                        : device.platform?.toLowerCase().includes('mobile') || device.platform?.toLowerCase().includes('android') || device.platform?.toLowerCase().includes('ios')
                                                            ? <Smartphone size={16} className="flex-shrink-0" />
                                                            : <Monitor size={16} className="flex-shrink-0" />;

                                                    return (
                                                        <div
                                                            key={device.id}
                                                            className="p-4 border text-sm flex items-start gap-4 bg-black/30 border-nano-border/50"
                                                        >
                                                            <div className="mt-0.5 text-nano-yellow">
                                                                {platformIcon}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-white font-medium truncate">
                                                                        {device.device_label || 'Unknown Device'}
                                                                    </span>
                                                                    <span className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded-sm uppercase tracking-wide border border-green-500/30 flex-shrink-0">
                                                                        Active
                                                                    </span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-nano-text">
                                                                    <div>Platform: <span className="text-white/70 capitalize">{device.platform || 'Unknown'}</span></div>
                                                                    {device.app_version && (
                                                                        <div>Version: <span className="text-white/70">{device.app_version}</span></div>
                                                                    )}
                                                                    <div>Activated: <span className="text-white/70">{device.first_activated_at ? new Date(device.first_activated_at).toLocaleDateString() : 'Unknown'}</span></div>
                                                                    <div>Last seen: <span className="text-white/70">{device.last_seen_at ? new Date(device.last_seen_at).toLocaleDateString() : 'Unknown'}</span></div>
                                                                    {device.device_fingerprint && (
                                                                        <div className="col-span-2">Fingerprint Suffix: <span className="text-white/70 font-mono">...{device.device_fingerprint.slice(-8)}</span></div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleDeactivateDevice(device.id)}
                                                                disabled={deactivatingDeviceId === device.id}
                                                                className="flex-shrink-0 p-2 text-nano-text/60 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-sm disabled:opacity-50"
                                                                title="Deactivate this device"
                                                            >
                                                                {deactivatingDeviceId === device.id
                                                                    ? <Loader2 size={14} className="animate-spin" />
                                                                    : <X size={14} />
                                                                }
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <p className="text-[11px] text-nano-text/50 mt-4">
                                            Need to move to a new device? Deactivate an existing one first, then open the app on your new device.
                                        </p>
                                    </div>
                                );
                            })()}

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
                                                        {order.licenseStatus && order.licenseStatus !== 'active' && (
                                                            <div className="mb-2">
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-wide border ${
                                                                    order.licenseStatus === 'refunded' ? 'bg-amber-900/40 text-amber-400 border-amber-500/30' :
                                                                    order.licenseStatus === 'revoked' ? 'bg-red-900/40 text-red-400 border-red-500/30' :
                                                                    order.licenseStatus === 'swapped' ? 'bg-blue-900/40 text-blue-400 border-blue-500/30' :
                                                                    order.licenseStatus === 'inactive' ? 'bg-white/5 text-nano-text/60 border-nano-border/20' :
                                                                    'bg-white/5 text-nano-text/60 border-nano-border/20'
                                                                }`}>License: {order.licenseStatus}</span>
                                                            </div>
                                                        )}
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
                                                            <strong className="text-white block uppercase tracking-wide">{sub.metadata?.product_name || subscriptionPlanDisplayName(sub.metadata?.product_key)}</strong>
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
                                        ) : licenses.filter(l => l.status === 'Active').length === 0 ? (
                                            <p className="text-nano-text text-sm">No active software licenses.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {licenses.filter(l => l.status === 'Active').map((lic, idx) => (
                                                    <div key={lic.licenseKeyFull || idx} className="p-4 bg-black/30 border border-nano-border/50 text-sm">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <strong className="text-white block truncate max-w-[200px]" title={lic.licenseName}>
                                                                {lic.licenseName}
                                                            </strong>
                                                            <span className="text-[10px] bg-green-900/40 text-green-400 px-2 py-0.5 rounded-sm uppercase tracking-wide border border-green-500/30">Active</span>
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
                                        {/* Inactive/Revoked/Refunded licenses shown as a summary */}
                                        {licenses && licenses.filter(l => l.status !== 'Active').length > 0 && (
                                            <div className="mt-6 pt-4 border-t border-nano-border/30">
                                                <h4 className="text-xs text-nano-text uppercase tracking-wide mb-3">Inactive Licenses</h4>
                                                <div className="space-y-2">
                                                    {licenses.filter(l => l.status !== 'Active').map((lic, idx) => (
                                                        <div key={lic.licenseKeyFull || idx} className="p-3 bg-black/20 border border-nano-border/20 text-sm flex justify-between items-center opacity-60">
                                                            <div>
                                                                <span className="text-white/70 text-xs">{lic.licenseName}</span>
                                                                <span className="text-[10px] text-nano-text/50 ml-2">Issued: {lic.issuedOn}</span>
                                                            </div>
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-wide border ${
                                                                lic.status === 'Refunded' ? 'bg-amber-900/40 text-amber-400 border-amber-500/30' :
                                                                lic.status === 'Revoked' ? 'bg-red-900/40 text-red-400 border-red-500/30' :
                                                                lic.status === 'Swapped' ? 'bg-blue-900/40 text-blue-400 border-blue-500/30' :
                                                                'bg-white/5 text-nano-text/60 border-nano-border/20'
                                                            }`}>{lic.status}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Downloads List */}
                                    <div className="rounded-sm border border-nano-border bg-nano-panel/20 p-6">
                                        <h3 className="text-xl font-bold mb-6">Software Downloads</h3>

                                        {dedupedDownloads && dedupedDownloads.length > 0 && dedupedDownloads.some(dl =>
                                            String(dl.platform ?? '').toLowerCase().includes('windows') ||
                                            String(dl.platform ?? '').toLowerCase().includes('win') ||
                                            String(dl.fileType ?? '').toLowerCase().includes('exe') ||
                                            String(dl.productName ?? '').toLowerCase().includes('windows')
                                        ) && (
                                            <div className="mb-6 p-4 border border-amber-500/20 bg-amber-500/5 rounded-sm text-xs text-nano-text/90 space-y-2 max-w-xl">
                                                <h4 className="font-bold text-amber-400 flex items-center gap-1.5 text-sm">
                                                    <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                                                    Windows SmartScreen Notice
                                                </h4>
                                                <p className="leading-relaxed">
                                                    Windows may show a “Windows protected your PC” warning because Cast Director Studio is a new desktop app and is still building Microsoft SmartScreen reputation.
                                                </p>
                                                <p className="leading-relaxed">
                                                    If you downloaded the installer from your official Cast Director Studio account dashboard, this is expected. To continue, click <span className="underline font-semibold">More info</span>, then <span className="underline font-semibold">Run anyway</span>.
                                                </p>
                                                <p className="leading-relaxed font-semibold text-white/95">
                                                    Only run installers downloaded from your account dashboard at castdirectorstudio.com.
                                                </p>
                                                <details className="mt-3 group cursor-pointer text-xs select-none pt-2 border-t border-amber-500/10">
                                                    <summary className="text-nano-text/50 hover:text-white transition-colors list-none flex items-center gap-1">
                                                        <span className="transition-transform group-open:rotate-90">▶</span>
                                                        <span>View SHA-256 Hash Verification</span>
                                                    </summary>
                                                    <div className="mt-2 pl-4 pr-2 py-2 bg-black/40 border border-nano-border/40 font-mono text-[10px] text-nano-yellow select-all break-all rounded-sm">
                                                        <span className="text-nano-text/60 block text-[9px] uppercase tracking-wider mb-0.5">SHA-256 Hash</span>
                                                        56AA635B9EA3A50C31EB356FB00D8D18520AE3E08EA9C4DC3F38B020B9E54E4E
                                                    </div>
                                                </details>
                                            </div>
                                        )}

                                        {!downloads ? (
                                            <p className="text-nano-text text-sm italic">Download server is currently unreachable.</p>
                                        ) : dedupedDownloads.length === 0 ? (
                                            <p className="text-nano-text text-sm">No downloads available yet.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {dedupedDownloads.map((dl, idx) => (
                                                    <div key={dl.id || idx} className="p-4 bg-black/30 border border-nano-border/50 text-sm">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <strong className="text-white block text-base">{dl.productName}</strong>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs text-nano-text mb-4">
                                                            <div>Platform: <span className="text-white">{dl.platform}</span></div>
                                                            <div>Version: <span className="text-white">{dl.version}</span></div>
                                                            <div>File Type: <span className="text-white">{dl.fileType}</span></div>
                                                        </div>

                                                        {dl.expiresAt && dl.isAvailable ? (
                                                            <div className="text-xs text-nano-text mb-4">
                                                                Download link valid until {dl.expiresAt}
                                                            </div>
                                                        ) : (dl.id === 'byok-windows-installer' || byokStatus?.hasIndie || byokStatus?.hasAgency) ? (
                                                            <div className="text-xs text-nano-yellow mb-4">
                                                                No active installer link found. Generate a fresh download link.
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-nano-text mb-4">
                                                                Download link expired.
                                                            </div>
                                                        )}

                                                        <div className="flex flex-col sm:flex-row gap-3 mt-4">
                                                            {!(byokStatus?.hasIndie || byokStatus?.hasAgency) ? (
                                                                <button
                                                                    disabled
                                                                    className="px-4 py-2 bg-gray-600 text-gray-400 font-bold text-xs uppercase tracking-wide text-center cursor-not-allowed border border-gray-600"
                                                                >
                                                                    License Inactive
                                                                </button>
                                                            ) : dl.isAvailable ? (
                                                                <button
                                                                    onClick={() => handleDownloadInstaller(dl.id)}
                                                                    disabled={downloadingId === dl.id}
                                                                    className="px-4 py-2 bg-nano-yellow text-black font-bold text-xs uppercase tracking-wide text-center hover:bg-nano-gold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                                                >
                                                                    {downloadingId === dl.id && <Loader2 size={14} className="animate-spin" />}
                                                                    Download Installer
                                                                </button>
                                                            ) : (() => {
                                                                const downloadId = getDownloadId(dl);
                                                                const isSynthesized = dl.id === 'byok-windows-installer';
                                                                const buttonText = isSynthesized ? 'Generate Download Link' : 'Generate Fresh Download Link';
                                                                return (
                                                                    <button
                                                                        onClick={() => {
                                                                            if (!downloadId) {
                                                                                setRefreshErrors((prev) => ({
                                                                                    ...prev,
                                                                                    [dl.id || 'unknown']: 'Could not refresh download link. Please contact support.'
                                                                                }));
                                                                                return;
                                                                            }
                                                                            handleRefreshDownloadLink(downloadId);
                                                                        }}
                                                                        disabled={!downloadId || refreshingId === downloadId}
                                                                        className="px-4 py-2 bg-nano-yellow text-black font-bold text-xs uppercase tracking-wide text-center hover:bg-nano-gold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                                                    >
                                                                        {refreshingId === downloadId && <Loader2 size={14} className="animate-spin" />}
                                                                        {buttonText}
                                                                    </button>
                                                                );
                                                            })()}
                                                        </div>

                                                        {refreshErrors[dl.id] && (
                                                            <div className="text-xs text-red-400 mt-3">
                                                                {refreshErrors[dl.id]}
                                                            </div>
                                                        )}
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
                            <div id="support-tickets" className="mt-8" ref={supportSectionRef}>
                                <SupportTickets session={session} onUnreadCount={handleUnreadCount} autoOpenTicketId={autoOpenTicketId} triggerNewTicket={triggerNewTicket} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
};

export default AccountDashboard;
