import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, AlertTriangle, Send, X, Loader2, Mail, Coins } from 'lucide-react';

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
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [missingSchema, setMissingSchema] = useState<string[]>([]);

  const [resendingState, setResendingState] = useState<{ [key: string]: boolean }>({});

  const handleTransactionalResend = async (action: string, entity_id: string) => {
    const key = `${action}_${entity_id}`;
    setResendingState(prev => ({...prev, [key]: true}));
    
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('resend-transactional-email', {
        body: { action, contact_id: contact.id, entity_id }
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

        if (contactData.user_id) {
           try {
             const { data: profileData } = await supabase.from('profiles').select('credit_balance').eq('id', contactData.user_id).single();
             if (profileData) setCreditBalance(profileData.credit_balance);
           } catch(e) {
             warnings.push("profiles.credit_balance");
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
  }, [id]);

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
      const { data, error: invokeErr } = await supabase.functions.invoke('send-ops-email', {
        body: {
          contact_id: contact.id,
          to: contact.email,
          subject: composeSubject,
          body: composeBody
        }
      });

      if (invokeErr) throw new Error(invokeErr.message || "Function invocation failed");
      if (data?.error) throw new Error(data.error);

      // Instantly inject into visual history
      setEmails(prev => [
        {
          id: data.messageId || 'pending-id',
          subject: composeSubject,
          provider_message_id: data.messageId,
          created_at: new Date().toISOString(),
          contact_id: contact.id
        },
        ...prev
      ]);

      setIsComposeOpen(false);
      setComposeSubject('');
      setComposeBody('');
    } catch (e: any) {
      setSendError(e.message || "Failed to dispatch email");
    } finally {
      setIsSending(false);
    }
  };

  const handleAdjustCredits = async () => {
    const amountNum = Number(adjustAmount);
    if (!adjustAmount || isNaN(amountNum)) {
      setAdjustError("Amount must be a valid number.");
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError("Reason is required.");
      return;
    }
    if (creditBalance !== null && creditBalance + amountNum < 0) {
      setAdjustError("Adjustment would result in a negative balance.");
      return;
    }

    setIsAdjusting(true);
    setAdjustError(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_add_credits', {
        p_contact_email: contact.email,
        p_amount: amountNum,
        p_reason: adjustReason
      });

      if (rpcErr) throw new Error(rpcErr.message);

      setCreditBalance(data as number);
      setIsAdjustCreditsOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
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
              {creditBalance !== null && (
                <div className="flex items-center gap-1.5 text-xs font-mono bg-nano-yellow/10 text-nano-yellow px-2 py-0.5 rounded border border-nano-yellow/20">
                  <Coins size={12} /> {creditBalance} Credits
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {creditBalance !== null && (
            <button
              onClick={() => setIsAdjustCreditsOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-black border border-nano-border text-white font-bold text-xs uppercase tracking-wider rounded-md hover:bg-white/5 transition-colors"
            >
              <Coins size={14} className="text-nano-yellow" /> Adjust Credits
            </button>
          )}
          <button
            onClick={() => setIsComposeOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-md hover:bg-gray-200 transition-colors"
          >
            <Send size={14} /> Send Email
          </button>
        </div>
      </div>

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
           {renderRichTable("Licenses", licenses, licenseColumns)}
           {renderRichTable("Downloads", downloads, downloadColumns)}
           {renderRichTable("Email Sends", emails, emailColumns)}
        </div>
      </div>

      {/* Compose Email Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-mono font-bold tracking-wide flex items-center gap-2">
                <Send size={16} className="text-nano-yellow" /> Operational Dispatch
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
                <span className="text-gray-300 bg-white/5 py-1.5 px-3 rounded text-xs select-all">EZ3D Avatars &lt;sales@castdirectorstudio.com&gt;</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-gray-500 text-xs uppercase">Reply-To:</span>
                <span className="text-gray-300 bg-white/5 py-1.5 px-3 rounded text-xs select-all">support@castdirectorstudio.com</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-gray-500 text-xs uppercase">To:</span>
                <span className="text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/20 py-1.5 px-3 rounded font-bold">{contact.email}</span>
              </div>

              <div className="pt-2">
                <input 
                  type="text" 
                  placeholder="Subject Line"
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  disabled={isSending}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600"
                />
              </div>

              <div>
                <textarea 
                  placeholder="Type your message here..."
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
                {isSending ? 'Dispatching...' : 'Dispatch'}
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
                <Coins size={16} className="text-nano-yellow" /> Adjust Credits
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
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <span className="text-gray-500 text-xs uppercase">Current:</span>
                <span className="text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/20 py-1.5 px-3 rounded font-bold">{creditBalance}</span>
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
                <div className="text-[10px] text-gray-500 mt-1">Use positive numbers to add, negative to remove.</div>
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase mb-2">Reason</label>
                <textarea 
                  placeholder="Reason for manual adjustment..."
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  disabled={isAdjusting}
                  rows={3}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600 resize-none font-sans"
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
                disabled={isAdjusting}
                className="px-6 py-2 bg-nano-yellow text-black rounded text-xs uppercase tracking-wider font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isAdjusting ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />} 
                {isAdjusting ? 'Applying...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetailAdmin;
