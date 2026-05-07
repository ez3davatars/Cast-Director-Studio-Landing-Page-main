import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, invokeAuthenticatedFunction } from '../../lib/supabase';
import { ChevronLeft, AlertTriangle, Send, X, Loader2, Mail, Coins, ShieldAlert, ShieldCheck, ShieldOff, PauseCircle, PlayCircle, XCircle } from 'lucide-react';

const CustomerDetailAdmin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contact, setContact] = useState<any>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isAdjustCreditsOpen, setIsAdjustCreditsOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustInternalNote, setAdjustInternalNote] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustResult, setAdjustResult] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<any[]>([]);
  const [missingSchema, setMissingSchema] = useState<string[]>([]);

  const [resendingState, setResendingState] = useState<{ [key: string]: boolean }>({});

  const [licenseModalState, setLicenseModalState] = useState<{
    isOpen: boolean;
    action: 'deactivate' | 'reactivate' | 'refund' | 'swap' | null;
    license: any | null;
    reason: string;
    internalNote: string;
    isSubmitting: boolean;
    error: string | null;
  }>({ isOpen: false, action: null, license: null, reason: '', internalNote: '', isSubmitting: false, error: null });

  const [isForceClaimOpen, setIsForceClaimOpen] = useState(false);
  const [isForceClaiming, setIsForceClaiming] = useState(false);
  const [forceClaimResult, setForceClaimResult] = useState<any>(null);
  const [forceClaimError, setForceClaimError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [isSendingReset, setIsSendingReset] = useState(false);
  const [sendResetResult, setSendResetResult] = useState<string | null>(null);
  const [sendResetError, setSendResetError] = useState<string | null>(null);

  // Account Status State
  const [accountStatus, setAccountStatus] = useState<string>('active');
  const [accountStatusReason, setAccountStatusReason] = useState<string | null>(null);
  const [accountStatusUpdatedAt, setAccountStatusUpdatedAt] = useState<string | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<'paused' | 'canceled' | 'active'>('paused');
  const [statusReason, setStatusReason] = useState('');
  const [statusSendEmail, setStatusSendEmail] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateResult, setStatusUpdateResult] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  const handleUpdateAccountStatus = async () => {
    if ((statusAction === 'paused' || statusAction === 'canceled') && statusReason.trim().length < 5) {
      setStatusUpdateError('Reason is required and must be at least 5 characters.');
      return;
    }

    setIsUpdatingStatus(true);
    setStatusUpdateError(null);
    setStatusUpdateResult(null);

    try {
      // Verify we have a valid admin session before calling the Edge Function
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      if (!activeSession?.access_token) {
        throw new Error('Admin session expired. Please refresh the page and sign in again.');
      }
      console.log('[AccountStatus] Session valid, invoking Edge Function...');
      console.log('[AccountStatus] Target:', contact.email, 'Action:', statusAction);

      const { data, error: invokeErr } = await invokeAuthenticatedFunction('admin-update-account-status', {
        customer_email: contact.email,
        status: statusAction,
        reason: statusReason.trim() || null,
        send_email: statusSendEmail,
      });

      console.log('[AccountStatus] Response:', data, 'Error:', invokeErr);

      if (invokeErr) throw new Error(invokeErr.message || 'Function invocation failed');
      if (data?.error) throw new Error(data.error);

      setAccountStatus(data.new_status);
      setAccountStatusReason(statusReason.trim() || null);
      setAccountStatusUpdatedAt(new Date().toISOString());

      let msg = data.message || 'Status updated.';
      if (data.warning) msg += ` ⚠️ ${data.warning}`;
      if (data.stripe_warning) msg += ` ⚠️ ${data.stripe_warning}`;
      setStatusUpdateResult(msg);

      setTimeout(() => {
        setStatusUpdateResult(null);
        setIsStatusModalOpen(false);
        setStatusReason('');
      }, 4000);
    } catch (e: any) {
      setStatusUpdateError(e.message || 'Failed to update account status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const openLicenseModal = (action: 'deactivate' | 'reactivate' | 'refund' | 'swap', license: any) => {
    setLicenseModalState({
      isOpen: true,
      action,
      license,
      reason: '',
      internalNote: '',
      isSubmitting: false,
      error: null
    });
  };

  const handleLicenseAction = async () => {
    const { action, license, reason, internalNote } = licenseModalState;
    if (!action || !license) return;

    if (!reason.trim()) {
      setLicenseModalState(s => ({ ...s, error: 'Reason is required.' }));
      return;
    }

    setLicenseModalState(s => ({ ...s, isSubmitting: true, error: null }));

    try {
      let rpcName = '';
      if (action === 'deactivate') rpcName = 'admin_deactivate_license';
      if (action === 'reactivate') rpcName = 'admin_reactivate_license';
      if (action === 'refund') rpcName = 'admin_mark_license_refunded';
      if (action === 'swap') rpcName = 'admin_mark_license_swapped';

      const { data, error } = await supabase.rpc(rpcName, {
        p_license_id: license.id,
        p_reason: reason.trim(),
        p_internal_note: internalNote.trim() || null
      });

      if (error) throw new Error(error.message);

      setLicenses(prev => prev.map(l => l.id === license.id ? { ...l, status: data.new_status } : l));
      setLicenseModalState(s => ({ ...s, isOpen: false, isSubmitting: false }));
      
      setAdjustResult(`License successfully marked as ${data.new_status}.`);
      setTimeout(() => setAdjustResult(null), 8000);
    } catch (err: any) {
      setLicenseModalState(s => ({ ...s, isSubmitting: false, error: err.message || 'Action failed' }));
    }
  };

  const openStatusModal = (action: 'paused' | 'canceled' | 'active') => {
    setStatusAction(action);
    setStatusReason('');
    setStatusSendEmail(true);
    setStatusUpdateResult(null);
    setStatusUpdateError(null);
    setIsStatusModalOpen(true);
  };

  const handleSendPasswordReset = async () => {
    setIsSendingReset(true);
    setSendResetError(null);
    setSendResetResult(null);

    try {
      const { data, error: invokeErr } = await invokeAuthenticatedFunction('admin-send-password-reset', { 
        email: contact.email 
      });

      if (invokeErr) throw new Error(invokeErr.message || "Function invocation failed");
      if (data?.error) throw new Error(data.error);

      setSendResetResult(data.message || "Password reset email sent.");
      setTimeout(() => setSendResetResult(null), 5000);
    } catch (e: any) {
      setSendResetError(e.message || "Failed to send reset email");
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleForceClaim = async () => {
    setIsForceClaiming(true);
    setForceClaimError(null);
    setForceClaimResult(null);

    try {
      const { data, error: invokeErr } = await invokeAuthenticatedFunction('admin-force-claim', { 
        email: contact.email 
      });

      if (invokeErr) throw new Error(invokeErr.message || "Function invocation failed");
      if (data?.error) throw new Error(data.error);

      setForceClaimResult(data);
      setRefreshKey(prev => prev + 1);
    } catch (e: any) {
      setForceClaimError(e.message || "Failed to force claim account");
    } finally {
      setIsForceClaiming(false);
    }
  };

  const handleTransactionalResend = async (action: string, entity_id: string) => {
    const key = `${action}_${entity_id}`;
    setResendingState(prev => ({...prev, [key]: true}));
    
    try {
      const { data, error: invokeErr } = await invokeAuthenticatedFunction('resend-transactional-email', {
        action, contact_id: contact.id, entity_id 
      });
      if (invokeErr) throw new Error(invokeErr.message);
      if (data?.error) throw new Error(data.error);
      
      setEmails(prev => [
        {
           id: data.messageId || `pending-${Date.now()}`,
           subject: `[SYSTEM] Resend Dispatch: ${action}`,
           provider_message_id: data.messageId,
           created_at: new Date().toISOString(),
           contact_id: contact.id
        },
        ...prev
      ]);
    } catch (e: any) {
      alert(`Resend Failed: ${e.message}`);
    } finally {
      setResendingState(prev => ({...prev, [key]: false}));
    }
  };

  // Email Compose State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const warnings: string[] = [];

      try {
        // 1. Fetch Contact Core (Fail-soft required)
        let contactQuery = supabase.from('contacts').select('id, email, created_at, user_id');
        if (id?.includes('@')) {
          contactQuery = contactQuery.eq('email', id);
        } else {
          contactQuery = contactQuery.eq('id', id);
        }
        const { data: contactData, error: contactErr } = await contactQuery.single();

        if (contactErr) throw contactErr;
        
        // 2. Fetch Optional Contact enrichments securely (Stripe ID)
        let stripeCustomerId = null;
        try {
          const { data: stripeData, error: stripeErr } = await supabase
             .from('contacts')
             .select('stripe_customer_id')
             .eq('id', contactData.id)
             .single();
          if (!stripeErr && stripeData) stripeCustomerId = stripeData.stripe_customer_id;
        } catch (e) {
            warnings.push("contacts.stripe_customer_id");
        }

        const assembledContact = { ...contactData, stripe_customer_id: stripeCustomerId };
        setContact(assembledContact);

        let resolvedUserId = contactData.user_id;
        if (!resolvedUserId) {
           try {
             const { data: crmData } = await supabase.from('crm_contacts').select('user_id').eq('email', contactData.email).maybeSingle();
             if (crmData?.user_id) resolvedUserId = crmData.user_id;
           } catch(e) {}
        }

        if (resolvedUserId) {
           try {
             const { data: profileData } = await supabase.from('profiles').select('credit_balance').eq('id', resolvedUserId).maybeSingle();
             if (profileData) setCreditBalance(profileData.credit_balance);
           } catch(e) {
             warnings.push("profiles.credit_balance");
           }

           try {
             const { data: ctData } = await supabase.from('credit_transactions').select('*').eq('user_id', resolvedUserId).order('created_at', { ascending: false });
             if (ctData) setCreditTransactions(ctData);
           } catch(e) {
             warnings.push("credit_transactions");
           }

           // Fetch account status separately — columns may not exist if migration hasn't run yet
           try {
             const { data: statusData } = await supabase.from('profiles').select('account_status, account_status_reason, account_status_updated_at').eq('id', resolvedUserId).maybeSingle();
             if (statusData) {
               if (statusData.account_status) setAccountStatus(statusData.account_status);
               if (statusData.account_status_reason) setAccountStatusReason(statusData.account_status_reason);
               if (statusData.account_status_updated_at) setAccountStatusUpdatedAt(statusData.account_status_updated_at);
             }
           } catch(e) {
             // account_status columns may not exist yet — safe to ignore
           }
        }

        // 3. Parallelize Telemetry Fetches
        const email = assembledContact.email;

        // A. Orders
        const ordersPromise = supabase
          .from('orders')
          .select('id, created_at, order_number, total_amount, payment_status, fulfillment_status')
          .eq('customer_email', email)
          .order('created_at', { ascending: false });

        // B. Subscriptions (Ordered match: stripe_id first. customer_email is NOT supported by schema. user_id skipped per instructions.)
        let subQuery = supabase
          .from('subscriptions')
          .select('id, created_at, status, stripe_customer_id, current_period_start, current_period_end, stripe_subscription_id, product_id')
          .order('created_at', { ascending: false });
          
        if (stripeCustomerId) {
           subQuery = subQuery.eq('stripe_customer_id', stripeCustomerId);
        } else {
           // We explicitly bounce this query because we cannot fallback to customer_email and we are banned from assuming user_id.
           subQuery = subQuery.eq('id', '00000000-0000-0000-0000-000000000000'); // deterministic fail
        }
        const subsPromise = subQuery;

        // C. Emails (Schema exposes contact_id, not recipient)
        const emailsPromise = supabase
          .from('email_sends')
          .select('id, subject, provider_message_id, created_at, contact_id')
          .eq('contact_id', contactData.id)
          .order('created_at', { ascending: false });

        // Phase 7: Global Products Dictionary
        const productsPromise = supabase
          .from('products')
          .select('id, name, sku');

        const [ordersRes, subsRes, emailsRes, productsRes] = await Promise.allSettled([
          ordersPromise, subsPromise, emailsPromise, productsPromise
        ]);

        const fetchedOrders = ordersRes.status === 'fulfilled' && !ordersRes.value.error ? ordersRes.value.data || [] : [];
        if (ordersRes.status === 'fulfilled' && ordersRes.value.error) warnings.push("orders (columns)");

        const fetchedSubs = subsRes.status === 'fulfilled' && !subsRes.value.error ? subsRes.value.data || [] : [];
        if (subsRes.status === 'fulfilled' && subsRes.value.error) warnings.push("subscriptions (columns)");

        const fetchedEmails = emailsRes.status === 'fulfilled' && !emailsRes.value.error ? emailsRes.value.data || [] : [];
        if (emailsRes.status === 'fulfilled' && emailsRes.value.error) warnings.push("email_sends (columns)");
        setEmails(fetchedEmails);

        const fetchedProducts = productsRes.status === 'fulfilled' && !productsRes.value.error ? productsRes.value.data || [] : [];
        const productsMap = new Map();
        fetchedProducts.forEach(p => productsMap.set(p.id, p));

        // D. Licenses & Downloads & Items (Dependent on Orders)
        const orderIds = fetchedOrders.map(o => o.id);
        let fetchedOrderItems: any[] = [];
        let fetchedLicenses: any[] = [];
        let fetchedDownloads: any[] = [];
        
        if (orderIds.length > 0) {
          const [itemsRes, licRes, downRes] = await Promise.allSettled([
            supabase.from('order_items').select('order_id, product_id').in('order_id', orderIds),
            supabase.from('licenses').select('id, created_at, order_id, license_key, status, is_perpetual, updates_expires_at, support_expires_at').in('order_id', orderIds).order('created_at', { ascending: false }),
            supabase.from('downloads').select('id, created_at, order_id, installer_id, download_count, max_downloads, expires_at').in('order_id', orderIds).order('created_at', { ascending: false })
          ]);
          
          if (itemsRes.status === 'fulfilled' && !itemsRes.value.error) fetchedOrderItems = itemsRes.value.data || [];
          else if (itemsRes.status === 'fulfilled') warnings.push("order_items (columns)");

          if (licRes.status === 'fulfilled' && !licRes.value.error) fetchedLicenses = licRes.value.data || [];
          else if (licRes.status === 'fulfilled') warnings.push("licenses (columns)");

          if (downRes.status === 'fulfilled' && !downRes.value.error) fetchedDownloads = downRes.value.data || [];
          else if (downRes.status === 'fulfilled') warnings.push("downloads (columns)");
        }

        // Context Binders
        const getOrderProduct = (orderId: string) => {
            const item = fetchedOrderItems.find(i => i.order_id === orderId);
            if (!item) return { name: 'Unknown Product', sku: '' };
            const p = productsMap.get(item.product_id);
            return {
                name: p?.name || 'Unknown Product',
                sku: p?.sku || ''
            };
        };

        const getDirectProduct = (productId: string, orderId?: string) => {
            if (productId) {
                const p = productsMap.get(productId);
                if (p) return { name: p.name, sku: p.sku };
            }
            if (orderId) return getOrderProduct(orderId);
            return { name: 'Unknown Product', sku: '' };
        };

        // Inject mapped _product into the local state variants before rendering
        setOrders(fetchedOrders.map(o => ({ ...o, _product: getOrderProduct(o.id) })));
        setSubscriptions(fetchedSubs.map(s => ({ ...s, _product: getDirectProduct(s.product_id) })));
        setLicenses(fetchedLicenses.map(l => ({ ...l, _product: getDirectProduct(null, l.order_id) })));
        setDownloads(fetchedDownloads.map(d => ({ ...d, _product: getDirectProduct(null, d.order_id) })));

        setMissingSchema(warnings);

      } catch (err: any) {
        setError(err.message || 'Failed to locate core contact identity.');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
  }, [id, refreshKey]);

  if (loading) return <div className="p-8 text-white font-mono animate-pulse">Assembling Operations Hub...</div>;
  if (error) return <div className="p-8 text-red-500 font-mono bg-red-500/10 border border-red-500/30 rounded">Contact resolution failed: {error}</div>;
  if (!contact) return <div className="p-8 text-gray-500 font-mono">Contact anchor not found.</div>;

  const renderRichTable = (title: string, dataArray: any[], columns: { header: string; render: (row: any) => React.ReactNode }[], renderActions?: (row: any) => React.ReactNode) => (
    <div className="bg-black/40 border border-nano-border rounded-lg overflow-hidden mb-8">
      <div className="px-4 py-3 border-b border-nano-border bg-black/60 flex justify-between items-center">
        <h3 className="font-mono text-sm tracking-widest uppercase text-white font-bold">{title}</h3>
        <span className="text-[10px] bg-nano-border px-2 py-0.5 rounded text-gray-300">{dataArray.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="border-b border-nano-border/50 text-[10px] uppercase tracking-wider text-nano-text">
              {columns.map((c, i) => <th key={i} className="p-3 font-mono">{c.header}</th>)}
              {renderActions && <th className="p-3 font-mono text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {dataArray.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (renderActions ? 1 : 0)} className="p-4 text-center text-gray-600 text-xs italic">No {title.toLowerCase()} attached</td>
              </tr>
            ) : (
              dataArray.map((row) => (
                <tr key={row.id} className="border-b border-nano-border/30 hover:bg-white/5 transition-colors group">
                  {columns.map((c, i) => <td key={i} className="p-3 align-top">{c.render(row)}</td>)}
                  {renderActions && (
                    <td className="p-3 align-top text-right">
                      {renderActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const orderColumns = [
    { header: 'Product', render: (row: any) => <div><div className="font-bold text-white max-w-[200px] truncate" title={row._product?.name}>{row._product?.name}</div><div className="text-[10px] text-nano-text font-mono mt-0.5 select-all">{row._product?.sku || 'SKU UNKNOWN'}</div></div> },
    { header: 'Amount / Status', render: (row: any) => <div><div className="text-white">{row.total_amount !== undefined && row.total_amount !== null ? `$${Number(row.total_amount).toFixed(2)}` : '--'}</div><div className="text-[10px] items-center flex gap-1 mt-0.5 uppercase"><span className="text-nano-yellow font-mono">{row.payment_status || 'UNKNOWN'}</span><span className="text-gray-500">|</span><span className="text-nano-text font-mono">{row.fulfillment_status || 'UNKNOWN'}</span></div></div> },
    { header: 'Identity', render: (row: any) => <div><div className="text-nano-text font-mono text-[10px] select-all">{row.order_number || row.id.split('-')[0]}</div><div className="text-[10px] text-gray-500 mt-0.5">{row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Unknown'}</div></div> }
  ];

  const licenseColumns = [
    { header: 'Product & Key', render: (row: any) => <div><div className="font-bold text-white max-w-[200px] truncate" title={row._product?.name}>{row._product?.name}</div><div className="text-[10px] text-nano-text font-mono mt-0.5 select-all">{row.license_key || row.id.split('-')[0]}</div></div> },
    { header: 'Type / Status', render: (row: any) => <div><div className="text-white capitalize">{row.status || 'Active'}</div><div className="text-[10px] text-nano-yellow font-mono mt-0.5 uppercase">{row.is_perpetual ? 'Perpetual' : 'Term'}</div></div> },
    { header: 'Expirations', render: (row: any) => <div><div className="text-[10px] text-gray-400">Updates: {row.updates_expires_at ? new Date(row.updates_expires_at).toLocaleDateString() : 'Never'}</div><div className="text-[10px] text-gray-400">Support: {row.support_expires_at ? new Date(row.support_expires_at).toLocaleDateString() : 'Never'}</div></div> }
  ];

  const downloadColumns = [
    { header: 'Product & OS', render: (row: any) => <div><div className="font-bold text-white max-w-[200px] truncate" title={row._product?.name}>{row._product?.name}</div><div className="text-[10px] text-nano-text font-mono mt-0.5">{row.installer_id || 'Cross-Platform Bin'}</div></div> },
    { header: 'Bandwidth', render: (row: any) => <div><div className="text-white font-mono">{row.download_count || 0} / {row.max_downloads === -1 || row.max_downloads === null ? '∞' : row.max_downloads}</div><div className="text-[10px] text-gray-500 font-mono mt-0.5 uppercase">FETCHES</div></div> },
    { header: 'Expiration', render: (row: any) => <div className="text-[10px] text-gray-400 mt-1.5">{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'Never'}</div> }
  ];

  const subscriptionColumns = [
    { header: 'Plan Name', render: (row: any) => <div><div className="font-bold text-white max-w-[200px] truncate" title={row._product?.name}>{row._product?.name}</div><div className="text-[10px] text-nano-text font-mono mt-0.5 select-all">{row.stripe_subscription_id || row.id.split('-')[0]}</div></div> },
    { header: 'Status', render: (row: any) => <div className="text-white capitalize font-mono text-sm">{row.status || 'active'}</div> },
    { header: 'Timeline', render: (row: any) => <div><div className="text-[10px] text-gray-400">Starts: {row.current_period_start ? new Date(row.current_period_start).toLocaleDateString() : 'Unknown'}</div><div className="text-[10px] text-gray-400">Ends: {row.current_period_end ? new Date(row.current_period_end).toLocaleDateString() : 'Unknown'}</div></div> }
  ];

  const emailColumns = [
    { header: 'Subject', render: (row: any) => <div><div className="font-bold text-white max-w-[250px] truncate" title={row.subject}>{row.subject}</div></div> },
    { header: 'Provider ID', render: (row: any) => <div className="text-[10px] text-nano-text font-mono">{row.provider_message_id || row.id.split('-')[0]}</div> },
    { header: 'Sent At', render: (row: any) => <div className="text-[10px] text-gray-400">{row.created_at ? new Date(row.created_at).toLocaleString() : 'Unknown'}</div> }
  ];

  const handleSendEmail = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      setSendError("Subject and Message body are required.");
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      // 1. Generate ticket ID
      const now = new Date();
      const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
      const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      const ticketId = `CDS-${datePart}-${randPart}`;

      // 2. Upsert CRM contact (crm_conversations FK points to crm_contacts, not contacts)
      const { data: crmContact, error: crmContactErr } = await supabase
        .from('crm_contacts')
        .upsert({
          email: contact.email,
          name: contact.name || contact.email,
          user_id: contact.user_id || null,
          source: 'admin_outreach',
        }, { onConflict: 'email' })
        .select('id')
        .single();

      if (crmContactErr || !crmContact) throw new Error(crmContactErr?.message || 'Failed to create CRM contact');

      // 3. Create CRM conversation
      const { data: convo, error: convoErr } = await supabase
        .from('crm_conversations')
        .insert({
          contact_id: crmContact.id,
          linked_user_id: contact.user_id || null,
          ticket_id: ticketId,
          subject: composeSubject,
          inquiry_type: 'Admin Outreach',
          category: 'general_support',
          priority: 'normal',
          status: 'waiting_on_customer',
          source: 'admin_outreach',
          last_admin_reply_at: now.toISOString(),
        })
        .select('id')
        .single();

      if (convoErr || !convo) throw new Error(convoErr?.message || 'Failed to create CRM conversation');

      // 4. Insert admin message
      const { error: msgErr } = await supabase
        .from('crm_messages')
        .insert({
          conversation_id: convo.id,
          direction: 'outbound',
          source: 'admin_outreach',
          sender_name: 'Support',
          sender_email: 'support@castdirectorstudio.com',
          body: composeBody,
          raw_payload: { source: 'admin_outreach', subject: composeSubject },
        });

      if (msgErr) throw new Error(msgErr.message || 'Failed to save CRM message');

      // 5. Send notification-only email (no message body)
      const notifBody = `Hello,\n\nYou have a new message from Cast Director Studio Support.\n\nTicket: ${ticketId}\n\nPlease log into your account dashboard to view the message and respond if needed:\nhttps://castdirectorstudio.com/account\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`;

      await invokeAuthenticatedFunction('send-ops-email', {
        contact_id: crmContact.id,
        to: contact.email,
        subject: `[${ticketId}] Cast Director Studio Support`,
        body: notifBody,
      });

      // 6. Update UI
      setEmails(prev => [
        {
          id: convo.id,
          subject: `[${ticketId}] ${composeSubject}`,
          provider_message_id: ticketId,
          created_at: now.toISOString(),
          contact_id: crmContact.id
        },
        ...prev
      ]);

      setIsComposeOpen(false);
      setComposeSubject('');
      setComposeBody('');
    } catch (e: any) {
      setSendError(e.message || "Failed to create support ticket");
    } finally {
      setIsSending(false);
    }
  };

  const handleAdjustCredits = async () => {
    const amountNum = parseInt(adjustAmount, 10);
    if (!adjustAmount || isNaN(amountNum)) {
      setAdjustError("Amount must be a valid integer.");
      return;
    }
    if (amountNum === 0) {
      setAdjustError("Adjustment amount cannot be zero.");
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError("A reason is required.");
      return;
    }
    if (creditBalance !== null && creditBalance + amountNum < 0) {
      setAdjustError("This adjustment would make the customer's balance negative.");
      return;
    }

    setIsAdjusting(true);
    setAdjustError(null);
    setAdjustResult(null);

    const reason = adjustReason.trim();
    const internalNote = adjustInternalNote.trim();

    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_adjust_user_credits', {
        p_user_id: contact.user_id,
        p_amount: amountNum,
        p_reason: reason,
        p_internal_note: internalNote || null
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      setCreditBalance(data.balance_after);
      
      // Refresh credit transactions
      const { data: ctData } = await supabase.from('credit_transactions').select('*').eq('user_id', contact.user_id).order('created_at', { ascending: false });
      if (ctData) setCreditTransactions(ctData);

      setAdjustResult(`Credit balance updated. Previous balance: ${data.balance_before}. Adjustment: ${data.adjustment}. New balance: ${data.balance_after}.`);
      
      setIsAdjustCreditsOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
      setAdjustInternalNote('');
      
      setTimeout(() => setAdjustResult(null), 8000);
    } catch (e: any) {
      setAdjustError(e.message || "Failed to adjust credits");
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin/customers')}
            className="p-2 bg-black border border-nano-border rounded hover:bg-white/5 transition-colors text-nano-text hover:text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold font-mono tracking-wide">Customer Overview</h2>
            <div className="flex items-center gap-4 mt-1">
              <div className="text-sm font-mono text-nano-yellow">{contact.email}</div>
              {creditBalance !== null ? (
                <div className="flex items-center gap-1.5 text-xs font-mono bg-nano-yellow/10 text-nano-yellow px-2 py-0.5 rounded border border-nano-yellow/20">
                  <Coins size={12} /> {creditBalance} Credits
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-mono bg-gray-500/10 text-gray-500 px-2 py-0.5 rounded border border-gray-500/20" title="Account not claimed yet">
                  <Coins size={12} /> Unclaimed
                </div>
              )}
              {accountStatus === 'active' && (
                <div className="flex items-center gap-1.5 text-xs font-mono bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20">
                  <ShieldCheck size={12} /> Active
                </div>
              )}
              {accountStatus === 'paused' && (
                <div className="flex items-center gap-1.5 text-xs font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                  <PauseCircle size={12} /> Paused
                </div>
              )}
              {accountStatus === 'canceled' && (
                <div className="flex items-center gap-1.5 text-xs font-mono bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                  <XCircle size={12} /> Canceled
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {creditBalance === null && (
            <button
              onClick={() => {
                setIsForceClaimOpen(true);
                setForceClaimResult(null);
                setForceClaimError(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-black border border-nano-border text-white font-bold text-xs uppercase tracking-wider rounded-md hover:bg-white/5 transition-colors"
            >
               Force Claim Account
            </button>
          )}
          {contact?.email && (
            <button
              onClick={handleSendPasswordReset}
              disabled={isSendingReset}
              className="flex items-center gap-2 px-4 py-2 bg-black border border-nano-border text-white font-bold text-xs uppercase tracking-wider rounded-md hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {isSendingReset ? <Loader2 size={14} className="animate-spin text-nano-yellow" /> : <Mail size={14} className="text-nano-yellow" />}
              Send Password Reset
            </button>
          )}
          <button
            onClick={() => setIsAdjustCreditsOpen(true)}
            disabled={!contact?.user_id}
            className="flex items-center gap-2 px-4 py-2 bg-black border border-nano-border text-white font-bold text-xs uppercase tracking-wider rounded-md hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={!contact?.user_id ? "Account not claimed yet" : ""}
          >
            <Coins size={14} className="text-nano-yellow" /> Adjust Credits
          </button>
          <button
            onClick={() => setIsComposeOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-md hover:bg-gray-200 transition-colors"
          >
            <Send size={14} /> New Ticket
          </button>
        </div>
      </div>

      {sendResetResult && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded mb-8 font-mono text-xs font-bold">
          {sendResetResult}
        </div>
      )}

      {adjustResult && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded mb-8 font-mono text-xs font-bold">
          {adjustResult}
        </div>
      )}

      {statusUpdateResult && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded mb-8 font-mono text-xs font-bold">
          {statusUpdateResult}
        </div>
      )}

      {statusUpdateError && !isStatusModalOpen && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded mb-8 font-mono text-xs font-bold">
          {statusUpdateError}
        </div>
      )}

      {/* Account Status Section */}
      {contact?.user_id && (
        <div className="bg-nano-panel/30 border border-nano-border rounded p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-nano-text mb-2">Account Status</h3>
              <div className="flex items-center gap-3">
                {accountStatus === 'active' && <span className="text-green-400 font-mono text-sm font-bold">Active</span>}
                {accountStatus === 'paused' && <span className="text-amber-400 font-mono text-sm font-bold">Paused</span>}
                {accountStatus === 'canceled' && <span className="text-red-400 font-mono text-sm font-bold">Canceled</span>}
                {accountStatusUpdatedAt && (
                  <span className="text-xs text-nano-text">Updated: {new Date(accountStatusUpdatedAt).toLocaleDateString()}</span>
                )}
              </div>
              {accountStatusReason && (accountStatus === 'paused' || accountStatus === 'canceled') && (
                <div className="mt-2 text-xs text-nano-text bg-black/30 p-2 rounded border border-nano-border">
                  <span className="font-bold text-white">Reason:</span> {accountStatusReason}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {accountStatus === 'active' && (
                <>
                  <button onClick={() => openStatusModal('paused')} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-xs uppercase tracking-wider rounded hover:bg-amber-500/20 transition-colors">
                    <PauseCircle size={14} /> Pause
                  </button>
                  <button onClick={() => openStatusModal('canceled')} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-xs uppercase tracking-wider rounded hover:bg-red-500/20 transition-colors">
                    <ShieldOff size={14} /> Cancel
                  </button>
                </>
              )}
              {accountStatus === 'paused' && (
                <>
                  <button onClick={() => openStatusModal('active')} className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-xs uppercase tracking-wider rounded hover:bg-green-500/20 transition-colors">
                    <PlayCircle size={14} /> Reactivate
                  </button>
                  <button onClick={() => openStatusModal('canceled')} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-xs uppercase tracking-wider rounded hover:bg-red-500/20 transition-colors">
                    <ShieldOff size={14} /> Cancel
                  </button>
                </>
              )}
              {accountStatus === 'canceled' && (
                <button onClick={() => openStatusModal('active')} className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-xs uppercase tracking-wider rounded hover:bg-green-500/20 transition-colors">
                  <PlayCircle size={14} /> Reactivate
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {sendResetError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded mb-8 font-mono text-xs font-bold">
          {sendResetError}
        </div>
      )}

      {missingSchema.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 p-4 rounded mb-8 font-mono text-xs flex items-start gap-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Partial Telemetry Missing:</strong> The remote database lacks specific structures required for a complete picture. The following tables/columns threw HTTP 400 schema mismatches and were safely ignored: 
            <span className="font-bold ml-1 text-white">{missingSchema.join(', ')}</span>
          </div>
        </div>
      )}

      {/* Grid Layout for Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
           {renderRichTable("Orders", orders, orderColumns, (order) => (
             <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end items-end">
                <button 
                  onClick={() => handleTransactionalResend('purchase_receipt', order.id)}
                  disabled={resendingState[`purchase_receipt_${order.id}`]}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] text-gray-300 font-bold uppercase transition-colors disabled:opacity-50 tracking-wider w-fit"
                  title="Resend Purchase Receipt"
                >
                  {resendingState[`purchase_receipt_${order.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} className="text-nano-yellow" />} Resend Receipt
                </button>
                <button 
                  onClick={() => handleTransactionalResend('license_download_details', order.id)}
                  disabled={resendingState[`license_download_details_${order.id}`]}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] text-gray-300 font-bold uppercase transition-colors disabled:opacity-50 tracking-wider w-fit"
                  title="Resend License & Download Details"
                >
                  {resendingState[`license_download_details_${order.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} className="text-nano-yellow" />} Resend License & Download Details
                </button>
             </div>
           ))}
           {renderRichTable("Subscriptions", subscriptions, subscriptionColumns, (sub) => (
             <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end items-end">
                <button 
                  onClick={() => handleTransactionalResend('subscription_confirmation', sub.id)}
                  disabled={resendingState[`subscription_confirmation_${sub.id}`]}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] text-gray-300 font-bold uppercase transition-colors disabled:opacity-50 tracking-wider w-fit"
                  title="Resend Subscription Confirmation"
                >
                  {resendingState[`subscription_confirmation_${sub.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} className="text-nano-yellow" />} Resend Subscription Confirmation
                </button>
                <button 
                  onClick={() => handleTransactionalResend('renewal_confirmation', sub.id)}
                  disabled={resendingState[`renewal_confirmation_${sub.id}`]}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] text-gray-300 font-bold uppercase transition-colors disabled:opacity-50 tracking-wider w-fit"
                  title="Resend Renewal Confirmation"
                >
                  {resendingState[`renewal_confirmation_${sub.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} className="text-nano-yellow" />} Resend Renewal Confirmation
                </button>
             </div>
           ))}
        </div>
        <div>
           {renderRichTable("Licenses", licenses, licenseColumns, (row) => (
              <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity items-end">
                {row.status === 'active' && <button onClick={() => openLicenseModal('deactivate', row)} className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] uppercase font-bold rounded hover:bg-red-500/20">Deactivate</button>}
                {(row.status === 'inactive' || row.status === 'revoked' || row.status === 'refunded' || row.status === 'swapped') && <button onClick={() => openLicenseModal('reactivate', row)} className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] uppercase font-bold rounded hover:bg-green-500/20">Reactivate</button>}
                {row.status !== 'refunded' && <button onClick={() => openLicenseModal('refund', row)} className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] uppercase font-bold rounded hover:bg-amber-500/20">Mark Refunded</button>}
                {row.status !== 'swapped' && <button onClick={() => openLicenseModal('swap', row)} className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] uppercase font-bold rounded hover:bg-blue-500/20">Swap</button>}
              </div>
           ))}
           {renderRichTable("Downloads", downloads, downloadColumns)}
           {renderRichTable("Email Sends", emails, emailColumns)}
           {renderRichTable("Credit History", creditTransactions, [
              { header: 'Kind', render: (row: any) => <div><div className="text-white font-mono text-[10px]">{row.kind}</div><div className="text-[10px] text-gray-500 mt-0.5">{row.created_at ? new Date(row.created_at).toLocaleString() : 'Unknown'}</div></div> },
              { header: 'Amount', render: (row: any) => <div><div className={`font-mono text-[12px] font-bold ${row.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>{row.amount > 0 ? '+' : ''}{row.amount}</div><div className="text-[10px] text-gray-500 mt-0.5">{row.balance_before} → {row.balance_after}</div></div> },
              { header: 'Reason & Note', render: (row: any) => <div><div className="text-white text-xs">{row.reason}</div>{row.metadata?.internal_note && <div className="text-[10px] text-amber-400 mt-0.5 italic">Note: {row.metadata.internal_note}</div>}</div> }
           ])}
        </div>
      </div>

      {/* Compose Email Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-mono font-bold tracking-wide flex items-center gap-2">
                <Send size={16} className="text-nano-yellow" /> New Support Ticket
              </h3>
              <button 
                onClick={() => !isSending && setIsComposeOpen(false)}
                className="text-gray-400 hover:text-white"
                disabled={isSending}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4 font-mono text-sm">
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-gray-500 text-xs uppercase">From:</span>
                <span className="text-gray-300 bg-white/5 py-1.5 px-3 rounded text-xs select-all">Cast Director Studio Support &lt;support@castdirectorstudio.com&gt;</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-gray-500 text-xs uppercase">To:</span>
                <span className="text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/20 py-1.5 px-3 rounded font-bold">{contact.email}</span>
              </div>
              <p className="text-[10px] text-gray-500 font-mono italic">This message will be posted to the customer's dashboard as a new support ticket. Email will only notify the customer that a ticket was opened — the full message content stays in the dashboard.</p>

              <div className="pt-2">
                <input 
                  type="text" 
                  placeholder="Subject"
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  disabled={isSending}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600"
                />
              </div>

              <div>
                <textarea 
                  placeholder="Type your message (visible in customer dashboard)..."
                  value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  disabled={isSending}
                  rows={8}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600 resize-none font-sans"
                />
              </div>

              {sendError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded text-xs">
                  {sendError}
                </div>
              )}
            </div>

            <div className="border-t border-nano-border bg-black/40 px-6 py-4 flex justify-end gap-3">
              <button 
                onClick={() => setIsComposeOpen(false)}
                disabled={isSending}
                className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleSendEmail}
                disabled={isSending}
                className="px-6 py-2 bg-nano-yellow text-black rounded text-xs uppercase tracking-wider font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} 
                {isSending ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Credits Modal */}
      {isAdjustCreditsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-mono font-bold tracking-wide flex items-center gap-2">
                <Coins size={16} className="text-nano-yellow" /> Admin Credit Adjustment
              </h3>
              <button 
                onClick={() => !isAdjusting && setIsAdjustCreditsOpen(false)}
                className="text-gray-400 hover:text-white"
                disabled={isAdjusting}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4 font-mono text-sm">
              <p className="text-[10px] text-gray-400 font-sans leading-relaxed mb-2">
                Manually add or deduct credits from this customer’s account. Every adjustment is recorded in the credit transaction history.
              </p>

              <div className="grid grid-cols-3 gap-2 bg-black/30 border border-nano-border p-3 rounded items-center text-center">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Before</div>
                  <div className="text-white font-bold">{creditBalance !== null ? creditBalance : '--'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Adjustment</div>
                  <div className={`font-bold ${parseInt(adjustAmount || '0') > 0 ? 'text-green-400' : parseInt(adjustAmount || '0') < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {parseInt(adjustAmount || '0') > 0 ? '+' : ''}{parseInt(adjustAmount || '0')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">After</div>
                  <div className={`font-bold ${(creditBalance || 0) + parseInt(adjustAmount || '0') < 0 ? 'text-red-500' : 'text-nano-yellow'}`}>
                    {creditBalance !== null && !isNaN(parseInt(adjustAmount || '0')) ? creditBalance + parseInt(adjustAmount || '0') : '--'}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-gray-500 text-xs uppercase mb-2">Adjustment Amount</label>
                <input 
                  type="number" 
                  placeholder="e.g. 100 or -50"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  disabled={isAdjusting}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600"
                />
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase mb-2">Reason (Required)</label>
                <input 
                  type="text"
                  placeholder="e.g. Refund for failed generation..."
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  disabled={isAdjusting}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600 font-sans"
                />
              </div>
              
              <div>
                <label className="block text-gray-500 text-xs uppercase mb-2">Internal Note (Optional)</label>
                <input 
                  type="text"
                  placeholder="Only visible to admins..."
                  value={adjustInternalNote}
                  onChange={e => setAdjustInternalNote(e.target.value)}
                  disabled={isAdjusting}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600 font-sans"
                />
              </div>

              {adjustError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded text-xs">
                  {adjustError}
                </div>
              )}
            </div>

            <div className="border-t border-nano-border bg-black/40 px-6 py-4 flex justify-end gap-3">
              <button 
                onClick={() => setIsAdjustCreditsOpen(false)}
                disabled={isAdjusting}
                className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleAdjustCredits}
                disabled={isAdjusting || !adjustAmount || parseInt(adjustAmount) === 0 || !adjustReason.trim() || ((creditBalance || 0) + parseInt(adjustAmount || '0') < 0)}
                className="px-6 py-2 bg-nano-yellow text-black rounded text-xs uppercase tracking-wider font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isAdjusting ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />} 
                {isAdjusting ? 'Applying...' : 'Confirm Credit Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Force Claim Modal */}
      {isForceClaimOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-mono font-bold tracking-wide flex items-center gap-2">
                <AlertTriangle size={16} className="text-nano-yellow" /> Force Claim Account
              </h3>
              <button 
                onClick={() => !isForceClaiming && setIsForceClaimOpen(false)}
                className="text-gray-400 hover:text-white"
                disabled={isForceClaiming}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4 font-mono text-sm">
              {!forceClaimResult ? (
                <>
                  <p className="text-gray-300">
                    This will create or locate a Supabase account for <strong className="text-white">{contact.email}</strong>, link orphaned purchases to that account, and send a password setup/reset email.
                  </p>
                  <p className="text-yellow-400 font-bold text-xs mt-2">
                    Continue?
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded text-xs font-bold">
                    {forceClaimResult.message}
                  </div>
                  <div className="bg-black/50 p-3 rounded border border-nano-border text-[10px] space-y-1 text-gray-400">
                    <div>Orders Linked: {forceClaimResult.details?.orders || 0}</div>
                    <div>Subscriptions Linked: {forceClaimResult.details?.subscriptions || 0}</div>
                    <div>Licenses Linked: {forceClaimResult.details?.licenses || 0}</div>
                    <div>Downloads Linked: {forceClaimResult.details?.downloads || 0}</div>
                    <div>Contacts Linked: {forceClaimResult.details?.contacts || 0}</div>
                  </div>
                </div>
              )}

              {forceClaimError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded text-xs">
                  {forceClaimError}
                </div>
              )}
            </div>

            <div className="border-t border-nano-border bg-black/40 px-6 py-4 flex justify-end gap-3">
              {!forceClaimResult ? (
                <>
                  <button 
                    onClick={() => setIsForceClaimOpen(false)}
                    disabled={isForceClaiming}
                    className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleForceClaim}
                    disabled={isForceClaiming}
                    className="px-6 py-2 bg-nano-yellow text-black rounded text-xs uppercase tracking-wider font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isForceClaiming ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />} 
                    {isForceClaiming ? 'Claiming...' : 'Force Claim'}
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setIsForceClaimOpen(false)}
                  className="px-6 py-2 bg-white/10 text-white border border-white/20 rounded text-xs uppercase tracking-wider font-bold hover:bg-white/20 transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Status Modal */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-nano-panel border border-nano-border rounded-sm max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-nano-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold font-mono uppercase tracking-wider">
                  {statusAction === 'paused' && 'Pause Account'}
                  {statusAction === 'canceled' && 'Cancel Account'}
                  {statusAction === 'active' && 'Reactivate Account'}
                </h3>
                <button onClick={() => setIsStatusModalOpen(false)} className="text-nano-text hover:text-white transition-colors"><X size={20} /></button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {statusAction === 'paused' && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-3 rounded text-xs">
                  This will temporarily block account access and send the customer an email with the reason.
                </div>
              )}
              {statusAction === 'canceled' && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded text-xs">
                  This will cancel account access and may affect active subscriptions. Stripe subscription cancellation must be completed manually.
                </div>
              )}
              {statusAction === 'active' && (
                <div className="bg-green-500/10 border border-green-500/30 text-green-300 p-3 rounded text-xs">
                  This will restore account access.
                </div>
              )}

              <div>
                <label className="text-xs text-nano-text uppercase tracking-wide block mb-1">
                  Reason {statusAction !== 'active' ? '(Required)' : '(Optional)'}
                </label>
                <textarea
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="w-full px-3 py-2 bg-black/30 border border-nano-border text-white text-sm outline-none rounded resize-none h-24"
                  placeholder={statusAction !== 'active' ? 'Reason for this action (min 5 characters)...' : 'Optional reason...'}
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-nano-text cursor-pointer">
                <input type="checkbox" checked={statusSendEmail} onChange={(e) => setStatusSendEmail(e.target.checked)} className="rounded" />
                Send notification email to customer
              </label>

              {statusUpdateError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded text-xs">
                  {statusUpdateError}
                </div>
              )}

              {statusUpdateResult && (
                <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded text-xs">
                  {statusUpdateResult}
                </div>
              )}
            </div>

            <div className="border-t border-nano-border bg-black/40 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setIsStatusModalOpen(false)}
                disabled={isUpdatingStatus}
                className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateAccountStatus}
                disabled={isUpdatingStatus}
                className={`px-6 py-2 rounded text-xs uppercase tracking-wider font-bold flex items-center gap-2 disabled:opacity-50 transition-colors ${
                  statusAction === 'paused' ? 'bg-amber-500 text-black hover:bg-amber-400' :
                  statusAction === 'canceled' ? 'bg-red-500 text-white hover:bg-red-400' :
                  'bg-green-500 text-black hover:bg-green-400'
                }`}
              >
                {isUpdatingStatus ? <Loader2 size={16} className="animate-spin" /> : null}
                {isUpdatingStatus ? 'Updating...' : statusAction === 'paused' ? 'Pause Account' : statusAction === 'canceled' ? 'Cancel Account' : 'Reactivate Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* License Action Modal */}
      {licenseModalState.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-mono font-bold tracking-wide flex items-center gap-2 capitalize">
                <ShieldAlert size={16} className="text-nano-yellow" /> {licenseModalState.action?.replace('_', ' ')} License
              </h3>
              <button 
                onClick={() => !licenseModalState.isSubmitting && setLicenseModalState(s => ({ ...s, isOpen: false }))}
                className="text-gray-400 hover:text-white"
                disabled={licenseModalState.isSubmitting}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4 font-mono text-sm">
              <p className="text-[10px] text-gray-400 font-sans leading-relaxed mb-2">
                Action: <strong className="text-white capitalize">{licenseModalState.action?.replace('_', ' ')}</strong><br/>
                Product: <strong className="text-white">{licenseModalState.license?._product?.name}</strong><br/>
                Key: <strong className="text-nano-text select-all">{licenseModalState.license?.license_key || licenseModalState.license?.id?.split('-')[0]}</strong>
              </p>

              {licenseModalState.action === 'refund' && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-3 rounded text-[10px] uppercase font-bold tracking-wider mb-4">
                  ⚠️ This marks the license as refunded inside Cast Director Studio. It does NOT issue a Stripe refund.
                </div>
              )}

              <div>
                <label className="block text-gray-500 text-xs uppercase mb-2">Reason (Required)</label>
                <input 
                  type="text"
                  placeholder="Reason for this status change..."
                  value={licenseModalState.reason}
                  onChange={e => setLicenseModalState(s => ({ ...s, reason: e.target.value }))}
                  disabled={licenseModalState.isSubmitting}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600 font-sans"
                />
              </div>
              
              <div>
                <label className="block text-gray-500 text-xs uppercase mb-2">Internal Note (Optional)</label>
                <input 
                  type="text"
                  placeholder="Only visible to admins..."
                  value={licenseModalState.internalNote}
                  onChange={e => setLicenseModalState(s => ({ ...s, internalNote: e.target.value }))}
                  disabled={licenseModalState.isSubmitting}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600 font-sans"
                />
              </div>

              {licenseModalState.error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded text-xs">
                  {licenseModalState.error}
                </div>
              )}
            </div>

            <div className="border-t border-nano-border bg-black/40 px-6 py-4 flex justify-end gap-3">
              <button 
                onClick={() => setLicenseModalState(s => ({ ...s, isOpen: false }))}
                disabled={licenseModalState.isSubmitting}
                className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleLicenseAction}
                disabled={licenseModalState.isSubmitting || !licenseModalState.reason.trim()}
                className="px-6 py-2 bg-nano-yellow text-black rounded text-xs uppercase tracking-wider font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {licenseModalState.isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null} 
                {licenseModalState.isSubmitting ? 'Applying...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetailAdmin;
