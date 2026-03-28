import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Mail, Loader2 } from 'lucide-react';

const LicensesAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(new Map());
  const [ordersMap, setOrdersMap] = useState<Map<string, string>>(new Map());
  const [contactsMap, setContactsMap] = useState<Map<string, string>>(new Map());

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
        const { data: lics, error: fetchErr } = await supabase
          .from('licenses')
          .select('id, created_at, order_id, license_key, status, activation_count, max_activations, is_perpetual, updates_expires_at, support_expires_at, product_id')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fetchErr) throw fetchErr;
        const validLics = lics || [];

        const orderIds = [...new Set(validLics.map((l: any) => l.order_id).filter(Boolean))];
        const productIds = [...new Set(validLics.map((l: any) => l.product_id).filter(Boolean))];

        const [ordersRes, prodsRes] = await Promise.allSettled([
          supabase.from('orders').select('id, customer_email').in('id', orderIds),
          supabase.from('products').select('id, name').in('id', productIds)
        ]);

        const oMap = new Map();
        let emails: string[] = [];
        if (ordersRes.status === 'fulfilled' && !ordersRes.value.error) {
            ordersRes.value.data.forEach((o: any) => {
                oMap.set(o.id, o.customer_email);
                if (o.customer_email) emails.push(o.customer_email);
            });
        }
        setOrdersMap(oMap);

        const pMap = new Map();
        if (prodsRes.status === 'fulfilled' && !prodsRes.value.error) {
            prodsRes.value.data.forEach((p: any) => pMap.set(p.id, p.name));
        }
        setProductsMap(pMap);

        const uniqueEmails = [...new Set(emails)];
        const cMap = new Map();
        if (uniqueEmails.length > 0) {
           const { data: cmapData, error: cmapErr } = await supabase.from('contacts').select('id, email').in('email', uniqueEmails);
           if (!cmapErr && cmapData) {
               cmapData.forEach(c => cMap.set(c.email, c.id));
           }
        }
        setContactsMap(cMap);

        setData(validLics);
      } catch (err: any) {
        setError(err.message || 'Failed to establish License records.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleTransactionalResend = async (orderId: string, email: string) => {
    const contactId = contactsMap.get(email);
    if (!contactId || !orderId) {
        alert("Cannot dispatch: Mission-critical ID anchor missing.");
        return;
    }
    setResendingState(prev => ({...prev, [orderId]: true}));
    
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('resend-transactional-email', {
        body: { action: 'license_download_details', contact_id: contactId, entity_id: orderId }
      });
      if (invokeErr) throw new Error(invokeErr.message);
      if (data?.error) throw new Error(data.error);
      alert("License email sent successfully.");
    } catch (e: any) {
      alert(`Resend Failed: ${e.message}`);
    } finally {
      setResendingState(prev => ({...prev, [orderId]: false}));
    }
  };

  const filtered = data.filter(d => {
      const em = ordersMap.get(d.order_id) || '';
      return JSON.stringify(d).toLowerCase().includes(search.toLowerCase()) || 
             em.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 font-mono tracking-wide">License Registry</h2>
      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search keys, products, or derived contacts..." />
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded mb-6 font-mono text-sm">
          Failed to load license records: {error}
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
                <th className="p-4 font-bold">Product & Key</th>
                <th className="p-4 font-bold">Type / Status</th>
                <th className="p-4 font-bold">Expirations</th>
                <th className="p-4 font-bold">Derived Identity</th>
                <th className="p-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 italic text-sm">No license records matched.</td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const email = ordersMap.get(row.order_id);
                  const contactId = email ? contactsMap.get(email) : null;
                  const productName = productsMap.get(row.product_id) || 'Unknown Product Layer';

                  return (
                    <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                      <td className="p-4">
                         <div className="font-bold text-white max-w-[200px] truncate">{productName}</div>
                         <div className="text-[10px] text-nano-text font-mono mt-0.5 select-all text-ellipsis overflow-hidden">{row.license_key || 'KEY UNKNOWN'}</div>
                      </td>
                      <td className="p-4">
                         <div className="text-white font-bold">{row.status}</div>
                         <div className="text-[10px] text-nano-yellow font-mono mt-0.5 uppercase tracking-wider">{row.is_perpetual ? 'PERPETUAL' : 'ANNUAL'}</div>
                      </td>
                      <td className="p-4 text-xs font-mono text-gray-400">
                         <div className="flex flex-col gap-1">
                             <div><span className="text-nano-text mr-1">Updates:</span> {row.updates_expires_at ? new Date(row.updates_expires_at).toLocaleDateString() : 'Never'}</div>
                             <div><span className="text-nano-text mr-1">Support:</span> {row.support_expires_at ? new Date(row.support_expires_at).toLocaleDateString() : 'Never'}</div>
                         </div>
                      </td>
                      <td className="p-4">
                         <div className="text-white font-bold text-sm truncate max-w-[150px]">{email || 'Not Relayed via Order Engine'}</div>
                         <div className="text-[10px] text-gray-500 mt-0.5 flex gap-1 items-center">
                            Uses: <span className="text-nano-yellow">{row.activation_count || 0}</span> / <span className="text-white">{row.max_activations || 0}</span>
                         </div>
                      </td>
                      <td className="p-4">
                         <div className="flex flex-col gap-2 items-start">
                             <button
                               onClick={() => contactId && navigate(`/admin/customers/${contactId}`)}
                               disabled={!contactId}
                               className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 bg-white/5 hover:bg-white/10 hover:text-white border border-nano-border"
                             >
                               <ExternalLink size={12} /> View Customer
                             </button>
                             <button
                               onClick={() => handleTransactionalResend(row.order_id, email!)}
                               disabled={resendingState[row.order_id] || !contactId || !row.order_id}
                               className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-nano-yellow bg-nano-yellow/5 hover:bg-nano-yellow/20 border border-nano-yellow/20"
                             >
                               {resendingState[row.order_id] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} 
                               {resendingState[row.order_id] ? 'Dispatching...' : 'Resend License Header'}
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

export default LicensesAdmin;
