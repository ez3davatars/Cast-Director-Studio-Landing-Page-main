import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';

const DownloadsAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: result, error: fetchErr } = await supabase
          .from('downloads')
          .select('id, customer_email, order_id, installer_id, platform, expires_at, download_count, max_downloads, created_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fetchErr) throw fetchErr;
        setData(result || []);
      } catch (err: any) {
        console.warn("Downloads fetch error:", err);
        setError(err.message || 'Failed to fetch downloads (missing database fields expected)');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = data.filter(d => 
    JSON.stringify(d).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 font-mono tracking-wide">Downloads</h2>
      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search downloads..." />
      
      {error && (
        <div className="bg-orange-500/10 border border-orange-500/50 text-orange-400 p-4 rounded mb-6 font-mono text-sm">
          <strong>Operational Notice:</strong> {error}. <br/>
          (The admin UI will still function, but some expected download fields may not yet exist in the database.)
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 italic">No downloads found.</td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono text-xs text-nano-yellow">{row.customer_email || 'Unknown'}</td>
                    <td className="p-4 text-xs font-mono">{row.order_id || 'N/A'}</td>
                    <td className="p-4 text-sm">
                      {row.installer_id || 'Unknown Installer'} <strong className="text-gray-400">({row.platform || 'Unknown Platform'})</strong>
                    </td>
                    <td className="p-4 text-sm font-mono">
                      {row.download_count !== undefined ? `${row.download_count} / ${row.max_downloads || '∞'}` : 'N/A'}
                    </td>
                    <td className="p-4 text-sm">{row.expires_at ? new Date(row.expires_at).toLocaleString() : 'Never'}</td>
                    <td className="p-4 text-sm">{row.created_at ? new Date(row.created_at).toLocaleString() : 'Unknown'}</td>
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

export default DownloadsAdmin;
