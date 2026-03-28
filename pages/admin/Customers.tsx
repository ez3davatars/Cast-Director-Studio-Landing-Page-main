import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';

const CustomersAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: result, error: fetchErr } = await supabase
          .from('contacts')
          .select('id, email, created_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fetchErr) throw fetchErr;
        setData(result || []);
      } catch (err: any) {
        console.warn("Customers fetch error:", err);
        setError(err.message || 'Failed to fetch contacts list');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = data.filter(d => 
    d.email?.toLowerCase().includes(search.toLowerCase()) || 
    d.id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2 font-mono tracking-wide">Customer Operations Hub</h2>
      <p className="text-sm text-gray-400 mb-6 font-sans">Select a customer below to view their unified operational telemetry (Orders, Subscriptions, Licenses, Downloads, and Emails).</p>
      
      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search exact email or local ID..." />
      
      {error && (
        <div className="bg-orange-500/10 border border-orange-500/50 text-orange-400 p-4 rounded mb-6 font-mono text-sm">
          <strong>Operational Notice:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse flex space-x-4">
          <div className="h-20 bg-white/10 rounded w-full"></div>
        </div>
      ) : (
        <div className="bg-black border border-nano-border rounded-lg overflow-x-auto shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-nano-border text-xs uppercase tracking-wider text-nano-text bg-white/5">
                <th className="p-4 font-mono">Customer Email</th>
                <th className="p-4 font-mono">Contact ID</th>
                <th className="p-4 font-mono">Created At</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 italic">No customers found.</td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono text-sm font-bold text-white">{row.email || 'No Email'}</td>
                    <td className="p-4 text-[10px] font-mono text-gray-500">{row.id}</td>
                    <td className="p-4 text-sm text-gray-400">{row.created_at ? new Date(row.created_at).toLocaleString() : 'Unknown'}</td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => navigate(`/admin/customers/${row.id}`)}
                        className="px-3 py-1.5 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-[10px] font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 transition-colors"
                      >
                        View Hub &rarr;
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomersAdmin;
