import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import AdminPagination from '../../components/AdminPagination';
import { useNavigate, useSearchParams } from 'react-router-dom';

const PAGE_SIZE = 25;

const CustomersAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const search = searchParams.get('q') || '';

  const setSearch = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('q', next);
    else params.delete('q');
    params.set('page', '1');
    setSearchParams(params);
  };

  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(Math.max(1, next)));
    setSearchParams(params);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        let query = supabase
          .from('crm_contacts')
          .select('id, email, name, company, user_id, created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (search.trim()) {
          const q = `%${search.trim()}%`;
          query = query.or(`email.ilike.${q},name.ilike.${q},company.ilike.${q}`);
        }

        const { data: result, error: fetchErr, count } = await query;

        if (fetchErr) throw fetchErr;
        setData(result || []);
        setTotal(count || 0);
      } catch (err: any) {
        console.warn("Customers fetch error:", err);
        setError(err.message || 'Failed to fetch CRM contacts list');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [page, search]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2 font-mono tracking-wide">Customer Operations Hub</h2>
      <p className="text-sm text-gray-400 mb-6 font-sans">Select a CRM contact to view their unified operational telemetry.</p>
      
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
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 italic">No customers found.</td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-mono text-sm font-bold text-white">{row.email || 'No Email'}</div>
                      <div className="mt-0.5 text-[11px] text-nano-text">{row.name || row.company || 'No CRM profile details'}</div>
                    </td>
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
          <AdminPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
};

export default CustomersAdmin;
