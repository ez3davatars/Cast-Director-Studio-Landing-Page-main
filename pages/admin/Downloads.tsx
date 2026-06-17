import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import AdminPagination from '../../components/AdminPagination';

const PAGE_SIZE = 25;

const DownloadsAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const search = searchParams.get('q') || '';
  const filter = searchParams.get('filter') || 'all';

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') params.set(key, value);
    else params.delete(key);
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
          .from('downloads')
          .select('id, customer_email, order_id, installer_id, platform, expires_at, download_count, max_downloads, created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (filter === 'expired') query = query.lt('expires_at', new Date().toISOString());
        if (filter === 'limited') query = query.not('max_downloads', 'is', null);
        if (search.trim()) {
          const q = `%${search.trim()}%`;
          query = query.or(`customer_email.ilike.${q},installer_id.ilike.${q},platform.ilike.${q}`);
        }

        const { data: result, error: fetchErr, count } = await query;
        if (fetchErr) throw fetchErr;
        setData(result || []);
        setTotal(count || 0);
      } catch (err: any) {
        console.warn('Downloads fetch error:', err);
        setError(err.message || 'Failed to fetch downloads.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [page, search, filter]);

  return (
    <div>
      <h2 className="mb-6 font-mono text-2xl font-bold tracking-wide">Downloads</h2>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <AdminSearchFilter value={search} onChange={(value) => updateParam('q', value)} placeholder="Search email, installer, or platform..." />
        <select
          value={filter}
          onChange={e => updateParam('filter', e.target.value)}
          className="rounded border border-nano-border bg-black px-3 py-2 text-xs font-bold uppercase tracking-wider text-white focus:border-nano-yellow focus:outline-none"
        >
          <option value="all">All downloads</option>
          <option value="expired">Expired</option>
          <option value="limited">Limited links</option>
        </select>
      </div>

      {error && (
        <div className="mb-6 rounded border border-orange-500/50 bg-orange-500/10 p-4 font-mono text-sm text-orange-400">
          <strong>Operational Notice:</strong> {error}.
        </div>
      )}

      {loading ? (
        <div className="animate-pulse">
          <div className="h-20 w-full rounded bg-white/10"></div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-nano-border bg-black">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-nano-border text-xs uppercase tracking-wider text-nano-text">
                <th className="p-4 font-mono">Customer Email</th>
                <th className="p-4 font-mono">Order Ref</th>
                <th className="p-4 font-mono">Installer / Platform</th>
                <th className="p-4 font-mono">Downloads</th>
                <th className="p-4 font-mono">Expires At</th>
                <th className="p-4 font-mono">Created At</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 italic">No downloads found.</td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id} className="border-b border-nano-border/50 transition-colors hover:bg-white/5">
                    <td className="p-4 font-mono text-xs text-nano-yellow">{row.customer_email || 'Unknown'}</td>
                    <td className="p-4 font-mono text-xs">{row.order_id || 'N/A'}</td>
                    <td className="p-4 text-sm">
                      {row.installer_id || 'Unknown Installer'} <strong className="text-gray-400">({row.platform || 'Unknown Platform'})</strong>
                    </td>
                    <td className="p-4 font-mono text-sm">
                      {row.download_count !== undefined ? `${row.download_count} / ${row.max_downloads || 'unlimited'}` : 'N/A'}
                    </td>
                    <td className="p-4 text-sm">{row.expires_at ? new Date(row.expires_at).toLocaleString() : 'Never'}</td>
                    <td className="p-4 text-sm">{row.created_at ? new Date(row.created_at).toLocaleString() : 'Unknown'}</td>
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

export default DownloadsAdmin;
