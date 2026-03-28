import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Mail, Loader2 } from 'lucide-react';

const SubscriptionsAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(new Map());
  const [contactsMap, setContactsMap] = useState<Map<string, any>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [resendingState, setResendingState] = useState<{ [key: string]: boolean }>({});
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: subs, error: fetchErr } = await supabase
          .from('subscriptions')
          .select('id, created_at, status, current_period_start, current_period_end, stripe_subscription_id, stripe_customer_id, product_id')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fetchErr) throw fetchErr;
        const validSubs = subs || [];

        const stripeCustomerIds = [...new Set(validSubs.map((s: any) => s.stripe_customer_id).filter(Boolean))];
        const productIds = [...new Set(validSubs.map((s: any) => s.product_id).filter(Boolean))];

        const [contactsRes, prodsRes] = await Promise.allSettled([
          supabase.from('contacts').select('id, email, stripe_customer_id').in('stripe_customer_id', stripeCustomerIds),
          supabase.from('products').select('id, name').in('id', productIds)
        ]);

        const cMap = new Map();
        if (contactsRes.status === 'fulfilled' && !contactsRes.value.error) {
            contactsRes.value.data.forEach((c: any) => cMap.set(c.stripe_customer_id, c));
        }
        setContactsMap(cMap);

        const pMap = new Map();
        if (prodsRes.status === 'fulfilled' && !prodsRes.value.error) {
            prodsRes.value.data.forEach((p: any) => pMap.set(p.id, p.name));
        }
        setProductsMap(pMap);

        setData(validSubs);
      } catch (err: any) {
        setError(err.message || 'Failed to establish Subscriptions telemetry.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleTransactionalResend = async (subId: string, contactId: string) => {
    setResendingState(prev => ({...prev, [subId]: true}));
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('resend-transactional-email', {
        body: { action: 'subscription_confirmation', contact_id: contactId, entity_id: subId }
      });
      if (invokeErr) throw new Error(invokeErr.message);
      if (data?.error) throw new Error(data.error);
      alert("Subscription Confirmation dispatched successfully.");
    } catch (e: any) {
      alert(`Resend Failed: ${e.message}`);
    } finally {
      setResendingState(prev => ({...prev, [subId]: false}));
    }
  };

  const filtered = data.filter(d => {
      const c = contactsMap.get(d.stripe_customer_id);
      return JSON.stringify(d).toLowerCase().includes(search.toLowerCase()) || 
             (c?.email || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 font-mono tracking-wide">Active Subscriptions</h2>
      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search plans, identities, or status arrays..." />
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded mb-6 font-mono text-sm">
          Failed to load telemetry structure: {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-white/10 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-white/10 rounded"></div>
              <div className="h-4 bg-white/10 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-black border border-nano-border rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                <th className="p-4 font-bold">Plan Name</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Timeline</th>
                <th className="p-4 font-bold">Identity Anchor</th>
                <th className="p-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 italic text-sm">No synchronized subscriptions found.</td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const contact = contactsMap.get(row.stripe_customer_id);
                  const planName = productsMap.get(row.product_id) || 'Unknown Plan';

                  return (
                    <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                      <td className="p-4">
                         <div className="font-bold text-white max-w-[200px] truncate">{planName}</div>
                         <div className="text-[10px] text-nano-text font-mono mt-0.5 select-all">{row.stripe_subscription_id || 'ID UNKNOWN'}</div>
                      </td>
                      <td className="p-4">
                         <div className="text-[10px] items-center flex gap-1 mt-0.5 uppercase">
                            <span className={row.status === 'active' ? 'text-green-400' : 'text-nano-yellow font-mono'}>{row.status || 'UNKNOWN'}</span>
                         </div>
                      </td>
                      <td className="p-4 text-xs font-mono text-gray-400">
                         <div className="flex flex-col gap-1">
                             <div><span className="text-nano-text mr-1">Starts:</span> {row.current_period_start ? new Date(row.current_period_start * 1000).toLocaleDateString() : 'Unknown'}</div>
                             <div><span className="text-nano-text mr-1">Ends:</span> {row.current_period_end ? new Date(row.current_period_end * 1000).toLocaleDateString() : 'Unknown'}</div>
                         </div>
                      </td>
                      <td className="p-4">
                         <div className="text-white font-bold text-sm truncate max-w-[150px]">{contact?.email || 'No Identity Bound'}</div>
                         <div className="text-[10px] text-gray-500 mt-0.5 select-all">{row.stripe_customer_id || 'No Stripe Match'}</div>
                      </td>
                      <td className="p-4">
                         <div className="flex flex-col gap-2 items-start">
                             <button
                               onClick={() => contact?.id && navigate(`/admin/customers/${contact.id}`)}
                               disabled={!contact?.id}
                               className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 bg-white/5 hover:bg-white/10 hover:text-white border border-nano-border"
                             >
                               <ExternalLink size={12} /> View Customer
                             </button>
                             <button
                               onClick={() => handleTransactionalResend(row.id, contact.id)}
                               disabled={resendingState[row.id] || !contact?.id}
                               className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-nano-yellow bg-nano-yellow/5 hover:bg-nano-yellow/20 border border-nano-yellow/20"
                             >
                               {resendingState[row.id] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} 
                               {resendingState[row.id] ? 'Dispatching...' : 'Resend Confirmation'}
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
    </div>
  );
};

export default SubscriptionsAdmin;
