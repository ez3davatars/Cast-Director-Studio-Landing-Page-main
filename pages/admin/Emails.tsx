import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';

const EmailsAdmin: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: result, error: fetchErr } = await supabase
          .from('email_sends')
          .select('id, subject, provider_message_id, created_at, contact_id')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fetchErr) throw fetchErr;
        setData(result || []);
      } catch (err: any) {
        console.warn("Emails fetch error:", err);
        setError(err.message || 'Failed to fetch emails (Table likely does not exist yet)');
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
      <h2 className="text-2xl font-bold mb-6 font-mono tracking-wide">Email Audits</h2>
      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search emails..." />
      
      {error && (
        <div className="bg-orange-500/10 border border-orange-500/50 text-orange-400 p-4 rounded mb-6 font-mono text-sm">
          <strong>Operational Notice:</strong> {error}. <br/>
          (The admin UI is fail-soft. This indicates the requested tracking columns do not exist yet on the remote database schema.)
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
                <th className="p-4 font-mono">Contact ID</th>
                <th className="p-4 font-mono">Subject</th>
                <th className="p-4 font-mono">Provider ID</th>
                <th className="p-4 font-mono">Created At</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 italic">No email logs found.</td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono text-xs text-nano-yellow">{row.contact_id || 'Unknown'}</td>
                    <td className="p-4 text-xs font-mono truncate max-w-xs">{row.subject || 'No Subject'}</td>
                    <td className="p-4 text-xs font-mono">{row.provider_message_id || 'N/A'}</td>
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

export default EmailsAdmin;
