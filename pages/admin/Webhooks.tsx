import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Terminal } from 'lucide-react';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'processed', label: 'Processed' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'refund', label: 'Refund' },
  { key: 'affiliate', label: 'Affiliate-related' },
] as const;

const formatDateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

const WebhooksAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [contactsMap, setContactsMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof FILTER_OPTIONS)[number]['key']>('all');
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: result, error: fetchErr } = await supabase
          .from('stripe_webhooks')
          // Attempting strict schema fetch. PostgREST will reject securely if schema is out of date.
          .select('id, created_at, event_type, processing_status, retry_count, error_message, processed_at, payload')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fetchErr) throw fetchErr;
        const hooks = result || [];

        // Safely extract potential customer anchors from generic JSONB payloads
        const extractEmail = (h: any) => h.payload?.data?.object?.customer_email || h.payload?.data?.object?.receipt_email || h.payload?.data?.object?.email;
        const extractStripeId = (h: any) => typeof h.payload?.data?.object?.customer === 'string' ? h.payload.data.object.customer : null;

        const emails = [...new Set(hooks.map(extractEmail).filter(Boolean))];
        const stripeIds = [...new Set(hooks.map(extractStripeId).filter(Boolean))];

        const cMap = new Map();

        // Map by Email
        if (emails.length > 0) {
           const { data: emailData } = await supabase.from('contacts').select('id, email').in('email', emails);
           emailData?.forEach(c => cMap.set(c.email, c.id));
        }
        
        // Map by Stripe ID
        if (stripeIds.length > 0) {
           const { data: stripeData } = await supabase.from('contacts').select('id, stripe_customer_id').in('stripe_customer_id', stripeIds);
           stripeData?.forEach(c => cMap.set(c.stripe_customer_id, c.id));
        }

        setContactsMap(cMap);
        setData(hooks);
      } catch (err: any) {
        console.warn("Webhooks structured fetch error:", err);
        setError(err.message || 'Failed to fetch webhooks sync data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const resolveIdentity = (row: any) => {
      const em = row.payload?.data?.object?.customer_email || row.payload?.data?.object?.receipt_email || row.payload?.data?.object?.email;
      const sid = typeof row.payload?.data?.object?.customer === 'string' ? row.payload.data.object.customer : null;
      
      const contactId = (em && contactsMap.get(em)) || (sid && contactsMap.get(sid)) || null;
      
      return { email: em, stripeId: sid, contactId };
  };

  const getStripeObjectId = (row: any) => {
    return row.payload?.data?.object?.id || row.payload?.data?.object?.invoice || row.payload?.data?.object?.payment_intent || row.payload?.data?.object?.charge || '—';
  };

  const getAffiliateTag = (row: any) => {
    return row.payload?.data?.object?.metadata?.affiliate_session_token
      || row.payload?.data?.object?.metadata?.affiliate_id
      || row.payload?.data?.object?.metadata?.affiliate_code
      || null;
  };

  const getEventPass = (row: any) => {
    const type = row.event_type?.toString?.() || '';
    const affiliateMetadata = getAffiliateTag(row);
    return {
      isCheckout: type.startsWith('checkout.') || row.payload?.data?.object?.object === 'checkout.session',
      isInvoice: type.startsWith('invoice.') || row.payload?.data?.object?.object === 'invoice',
      isRefund: type.includes('refund') || row.payload?.data?.object?.object === 'refund',
      isAffiliateRelated: Boolean(affiliateMetadata || type === 'checkout.session.completed' || type === 'invoice.payment_succeeded' || type === 'invoice.payment_failed'),
      affiliateMetadata,
    };
  };

  const filtered = data.filter((row) => {
    const expanded = JSON.stringify({
      ...row,
      payload: row.payload ? { ...row.payload, data: row.payload.data } : row.payload,
    }).toLowerCase();
    const searchMatch = expanded.includes(search.toLowerCase());
    const eventPass = getEventPass(row);

    const statusMatch =
      activeFilter === 'all' ||
      (activeFilter === 'pending' && (row.processing_status === 'pending' || !row.processed_at)) ||
      (activeFilter === 'failed' && (row.processing_status === 'failed' || Boolean(row.error_message))) ||
      (activeFilter === 'processed' && row.processing_status === 'processed');

    const typeMatch =
      activeFilter === 'all' ||
      (activeFilter === 'checkout' && eventPass.isCheckout) ||
      (activeFilter === 'invoice' && eventPass.isInvoice) ||
      (activeFilter === 'refund' && eventPass.isRefund) ||
      (activeFilter === 'affiliate' && eventPass.isAffiliateRelated);

    return searchMatch && statusMatch && typeMatch;
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-3 font-mono tracking-wide">Webhook Monitor</h2>
        <p className="max-w-3xl text-sm text-nano-text">Inspect Stripe webhook events, fulfillment traces, affiliate attribution, and processing issues.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.7fr_auto]">
          <AdminSearchFilter
            value={search}
            onChange={setSearch}
            placeholder="Search event type, trace id, customer, order, affiliate, or error message..."
          />
          <div className="flex flex-wrap items-center gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveFilter(option.key)}
                className={`rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${activeFilter === option.key ? 'border-nano-yellow bg-nano-yellow/15 text-nano-yellow' : 'border-nano-border bg-black/70 text-nano-text hover:border-white/20 hover:text-white'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-nano-border bg-black/40 p-4 text-sm text-gray-400">
          Use this page to debug missing licenses, failed fulfillment, affiliate commission issues, refunds, and webhook retries.
        </div>
      </div>

      {error && (
        <div className="bg-orange-500/10 border border-orange-500/50 text-orange-400 p-4 rounded mb-6 font-mono text-sm max-w-3xl leading-relaxed">
          <strong>Operational Notice:</strong> The physical database schema likely lacks the specific structural columns (<code>event_type</code>, <code>processing_status</code>, etc.) required for the advanced trace view. 
          <br/><br/>
          Raw Error: <span className="text-gray-400">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse flex space-x-4">
          <div className="h-20 bg-white/10 rounded w-full"></div>
        </div>
      ) : (
        <div className="bg-black border border-nano-border rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                <th className="p-4 font-bold">Event type</th>
                <th className="p-4 font-bold">Stripe event / trace</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Matched customer / order / affiliate</th>
                <th className="p-4 font-bold">Created at</th>
                <th className="p-4 font-bold">Processed at</th>
                <th className="p-4 font-bold">Error summary</th>
                <th className="p-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500 italic text-sm">No webhook events matched the current filter and search criteria.</td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const { email, stripeId, contactId } = resolveIdentity(row);
                  const stripeObjectId = getStripeObjectId(row);
                  const { affiliateMetadata } = getEventPass(row);

                  return (
                    <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                      <td className="p-4">
                         <div className="font-bold text-white max-w-[240px] truncate" title={row.event_type}>{row.event_type || 'unclassified.event'}</div>
                         <div className="text-[10px] text-nano-text mt-1">{row.payload?.type || row.payload?.data?.object?.object || 'stripe webhook'}</div>
                      </td>
                      <td className="p-4">
                         <div className="text-[11px] font-mono text-nano-text truncate max-w-[180px]" title={row.payload?.id || row.id}>{row.payload?.id || row.id}</div>
                         {row.id && <div className="text-[10px] text-gray-500 mt-1">trace {String(row.id).slice(0, 12)}</div>}
                      </td>
                      <td className="p-4">
                         <div className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase ${row.processing_status === 'processed' ? 'bg-green-500/10 text-green-300 border border-green-500/20' : row.processing_status === 'failed' ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-nano-border text-nano-text border border-nano-border'}`}>
                            {row.processing_status || 'unknown'}
                         </div>
                         {row.retry_count != null && (
                           <div className="text-[10px] text-gray-500 mt-1">Retries: {row.retry_count}</div>
                         )}
                      </td>
                      <td className="p-4">
                         {email ? <div className="text-sm font-bold text-white truncate" title={email}>Customer: {email}</div> : stripeId ? <div className="text-sm font-bold text-white truncate">Customer: {stripeId}</div> : <div className="text-sm text-nano-text">No matched customer</div>}
                         {stripeObjectId && stripeObjectId !== '—' && (
                           <div className="text-[11px] text-gray-400 truncate">Object: {stripeObjectId}</div>
                         )}
                         {affiliateMetadata && (
                           <div className="text-[11px] text-nano-yellow truncate">Affiliate token: {affiliateMetadata}</div>
                         )}
                      </td>
                      <td className="p-4 text-[11px] font-mono text-nano-text">{formatDateTime(row.created_at)}</td>
                      <td className="p-4 text-[11px] font-mono text-nano-text">{formatDateTime(row.processed_at)}</td>
                      <td className="p-4 text-[11px] font-mono text-red-400 truncate max-w-[220px]">{row.error_message || '—'}</td>
                      <td className="p-4">
                         <div className="flex flex-col gap-2 items-start">
                             <button
                               onClick={() => setSelectedPayload(row)}
                               className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-nano-yellow bg-nano-yellow/5 hover:bg-nano-yellow/20 border border-nano-yellow/20"
                             >
                               <Terminal size={12} /> View Raw Trace
                             </button>
                             <button
                               onClick={() => contactId && navigate(`/admin/customers/${contactId}`)}
                               disabled={!contactId}
                               className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors border ${contactId ? 'text-gray-300 bg-white/5 hover:bg-white/10 hover:text-white border-nano-border' : 'opacity-30 cursor-not-allowed border-transparent'}`}
                             >
                               <ExternalLink size={12} /> View CRM Anchor
                             </button>
                         </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw Payload Inspector Modal */}
      {selectedPayload && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] h-[80vh]">
            <div className="h-16 flex items-center justify-between px-6 border-b border-nano-border bg-black/40 flex-shrink-0">
               <h3 className="font-mono text-nano-yellow font-bold uppercase tracking-widest flex items-center gap-2 text-sm">
                  <Terminal size={16} /> Trace Inspector: {selectedPayload.event_type || 'Unclassified Event'}
               </h3>
               <button onClick={() => setSelectedPayload(null)} className="text-gray-400 hover:text-white p-2">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-black">
               <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">
                   {JSON.stringify(selectedPayload.payload || selectedPayload, null, 2)}
               </pre>
            </div>
            <div className="h-12 border-t border-nano-border px-6 flex items-center justify-between flex-shrink-0 bg-black/40">
               <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Trace Anchor: {selectedPayload.id}</div>
               <button className="text-[10px] uppercase tracking-wider font-bold text-gray-400 hover:text-white" onClick={() => setSelectedPayload(null)}>Close Trace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebhooksAdmin;
