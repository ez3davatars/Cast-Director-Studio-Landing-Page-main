import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Terminal } from 'lucide-react';

const WebhooksAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [contactsMap, setContactsMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
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

  const filtered = data.filter(d => 
    JSON.stringify(d).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 font-mono tracking-wide">Webhook Traces</h2>
      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search exact webhook streams or parsed identity traces..." />
      
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
                <th className="p-4 font-bold">Event Matrix</th>
                <th className="p-4 font-bold">Processing Status</th>
                <th className="p-4 font-bold">Inferred Identity Anchor</th>
                <th className="p-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 italic text-sm">No localized webhooks matched trace criteria.</td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const { email, stripeId, contactId } = resolveIdentity(row);

                  return (
                    <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                      <td className="p-4">
                         <div className="font-bold text-white max-w-[250px] truncate" title={row.event_type}>{row.event_type || 'unclassified.event'}</div>
                         <div className="text-[10px] text-nano-text font-mono mt-0.5 select-all text-ellipsis overflow-hidden">{row.id || 'TRACE UNKNOWN'}</div>
                      </td>
                      <td className="p-4">
                         <div className="text-[10px] items-center flex gap-1 mt-0.5 uppercase">
                            <span className={row.processing_status === 'processed' ? 'text-green-400' : 'text-nano-yellow font-mono'}>{row.processing_status || 'UNKNOWN'}</span>
                            <span className="text-gray-500">|</span>
                            <span className="text-nano-text font-mono"><span className="text-gray-500">retries:</span> {row.retry_count || 0}</span>
                         </div>
                         {row.error_message && (
                             <div className="text-[10px] text-red-400 font-mono mt-1 opacity-80 truncate max-w-[150px]">
                                {row.error_message}
                             </div>
                         )}
                      </td>
                      <td className="p-4">
                         <div className="text-white font-bold text-sm truncate max-w-[200px]">{email || stripeId || 'No Readable Identity Node'}</div>
                         <div className="text-[10px] text-gray-500 mt-0.5 flex flex-col gap-0.5 font-mono">
                            <div><span className="text-nano-text mr-1">T-Zero:</span> {row.created_at ? new Date(row.created_at).toLocaleString() : 'Unknown Timing'}</div>
                            <div><span className="text-nano-text mr-1">T-End:</span> {row.processed_at ? new Date(row.processed_at).toLocaleString() : 'Pending'}</div>
                         </div>
                      </td>
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
                   {JSON.stringify(selectedPayload, null, 2)}
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
