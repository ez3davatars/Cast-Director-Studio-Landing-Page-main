import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Mail, Loader2 } from 'lucide-react';

const OrdersAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, any>>(new Map());
  const [itemsData, setItemsData] = useState<any[]>([]);
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
        // 1. Fetch Orders (Fail-soft safe explicit columns)
        const { data: ords, error: fetchErr } = await supabase
          .from('orders')
          .select('id, created_at, order_number, customer_email, total_amount, payment_status, fulfillment_status, fulfilled_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fetchErr) throw fetchErr;
        const validOrders = ords || [];

        // 2. Extract Relational IDs
        const orderIds = validOrders.map((o: any) => o.id);
        const emails = [...new Set(validOrders.map((o: any) => o.customer_email).filter(Boolean))];

        // 3. Parallelized Safe Lookups
        const [prodsRes, itemsRes, contactsRes] = await Promise.allSettled([
          supabase.from('products').select('id, name, sku'),
          supabase.from('order_items').select('order_id, product_id').in('order_id', orderIds),
          supabase.from('contacts').select('id, email').in('email', emails)
        ]);

        // 4. Map Products safely
        const pMap = new Map();
        if (prodsRes.status === 'fulfilled' && !prodsRes.value.error) {
            prodsRes.value.data.forEach((p: any) => pMap.set(p.id, p));
        }
        setProductsMap(pMap);

        // 5. Map Items securely
        if (itemsRes.status === 'fulfilled' && !itemsRes.value.error) {
            setItemsData(itemsRes.value.data || []);
        }

        // 6. Map Contacts securely (Email -> ID)
        const cMap = new Map();
        if (contactsRes.status === 'fulfilled' && !contactsRes.value.error) {
            contactsRes.value.data.forEach((c: any) => cMap.set(c.email, c.id));
        }
        setContactsMap(cMap);

        setData(validOrders);
      } catch (err: any) {
        setError(err.message || 'Failed to establish Orders telemetry.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getProductContext = (orderId: string) => {
     const item = itemsData.find(i => i.order_id === orderId);
     if (!item) return { name: 'Unknown Product', sku: '' };
     const p = productsMap.get(item.product_id);
     return { name: p?.name || 'Unknown Product', sku: p?.sku || '' };
  };

  const handleTransactionalResend = async (orderId: string, customerEmail: string) => {
    const contactId = contactsMap.get(customerEmail);
    if (!contactId) {
        alert("Cannot resend natively: No matched Contact ID found for this email block.");
        return;
    }

    setResendingState(prev => ({...prev, [orderId]: true}));
    
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('resend-transactional-email', {
        body: { action: 'purchase_receipt', contact_id: contactId, entity_id: orderId }
      });
      if (invokeErr) throw new Error(invokeErr.message);
      if (data?.error) throw new Error(data.error);
      alert("Receipt dispatched successfully.");
    } catch (e: any) {
      alert(`Resend Failed: ${e.message}`);
    } finally {
      setResendingState(prev => ({...prev, [orderId]: false}));
    }
  };

  const filtered = data.filter(d => 
    JSON.stringify(d).toLowerCase().includes(search.toLowerCase()) || 
    JSON.stringify(getProductContext(d.id)).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 font-mono tracking-wide">Orders Registry</h2>
      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search exact orders, products, or identities..." />
      
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
                <th className="p-4 font-bold">Product</th>
                <th className="p-4 font-bold">Amount / Status</th>
                <th className="p-4 font-bold">Identity</th>
                <th className="p-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 italic text-sm">No localized orders found matching filter criteria.</td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const pCtx = getProductContext(row.id);
                  const contactId = contactsMap.get(row.customer_email);

                  return (
                    <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                      <td className="p-4">
                         <div className="font-bold text-white max-w-[200px] truncate">{pCtx.name}</div>
                         <div className="text-[10px] text-nano-text font-mono mt-0.5 select-all">{pCtx.sku || 'SKU UNKNOWN'}</div>
                      </td>
                      <td className="p-4">
                         <div className="text-white">{row.total_amount !== undefined && row.total_amount !== null ? `$${Number(row.total_amount).toFixed(2)}` : '--'}</div>
                         <div className="text-[10px] items-center flex gap-1 mt-0.5 uppercase">
                            <span className="text-nano-yellow font-mono">{row.payment_status || 'UNKNOWN'}</span>
                            <span className="text-gray-500">|</span>
                            <span className="text-nano-text font-mono">{row.fulfillment_status || 'UNKNOWN'}</span>
                         </div>
                      </td>
                      <td className="p-4">
                         <div className="text-nano-text font-mono text-[10px] select-all truncate max-w-[150px]">{row.customer_email || 'No Identity Bound'}</div>
                         <div className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[150px]" title={row.id}>{row.order_number || row.id.split('-')[0]}</div>
                         <div className="text-[10px] text-gray-600 mt-0.5">{row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Unknown Timing'}</div>
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
                               onClick={() => handleTransactionalResend(row.id, row.customer_email)}
                               disabled={resendingState[row.id] || !contactId}
                               className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-nano-yellow bg-nano-yellow/5 hover:bg-nano-yellow/20 border border-nano-yellow/20"
                             >
                               {resendingState[row.id] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} 
                               {resendingState[row.id] ? 'Dispatching...' : 'Resend Receipt'}
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

export default OrdersAdmin;
