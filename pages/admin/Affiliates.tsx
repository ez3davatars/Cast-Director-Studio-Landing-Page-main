import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, X, ChevronRight, UserPlus } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    'text-green-400 bg-green-400/10 border border-green-400/30',
  pending:   'text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30',
  suspended: 'text-red-400 bg-red-400/10 border border-red-400/30',
};

function slugify(email: string): string {
  return email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

const TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'pending',   label: 'Pending'   },
  { key: 'active',    label: 'Active'    },
  { key: 'suspended', label: 'Suspended' },
] as const;

type StatusFilter = typeof TABS[number]['key'];

// ── Component ─────────────────────────────────────────────────────────────────

const AffiliatesAdmin: React.FC = () => {
  const navigate = useNavigate();

  // List state
  const [data, setData]         = useState<any[]>([]);
  const [linksMap, setLinksMap] = useState<Map<string, { linkCount: number; totalClicks: number }>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Create modal state
  const [isCreateOpen,   setIsCreateOpen]   = useState(false);
  const [createEmail,    setCreateEmail]    = useState('');
  const [createCode,     setCreateCode]     = useState('');
  const [createRate,     setCreateRate]     = useState('0.30');
  const [createDuration, setCreateDuration] = useState('12');
  const [isCreating,     setIsCreating]     = useState(false);
  const [createError,    setCreateError]    = useState<string | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [affiliatesRes, linksRes] = await Promise.allSettled([
        supabase
          .from('affiliates')
          .select('id, code, contact_email, status, commission_rate, commission_duration_months, created_at, paypal_email')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('affiliate_links')
          .select('affiliate_id, click_count'),
      ]);

      if (affiliatesRes.status === 'fulfilled' && !affiliatesRes.value.error) {
        setData(affiliatesRes.value.data || []);
      } else {
        const msg = affiliatesRes.status === 'rejected'
          ? affiliatesRes.reason?.message
          : (affiliatesRes.value.error as any)?.message;
        throw new Error(msg || 'Failed to load affiliates');
      }

      if (linksRes.status === 'fulfilled' && !linksRes.value.error) {
        const lMap = new Map<string, { linkCount: number; totalClicks: number }>();
        for (const l of (linksRes.value.data || [])) {
          const cur = lMap.get(l.affiliate_id) || { linkCount: 0, totalClicks: 0 };
          lMap.set(l.affiliate_id, {
            linkCount:   cur.linkCount + 1,
            totalClicks: cur.totalClicks + (l.click_count || 0),
          });
        }
        setLinksMap(lMap);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load affiliates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleQuickStatus = async (
    e: React.MouseEvent, id: string, newStatus: 'active' | 'suspended' | 'pending'
  ) => {
    e.stopPropagation();
    const { error: updateErr } = await supabase
      .from('affiliates')
      .update({ status: newStatus })
      .eq('id', id);
    if (updateErr) { alert(`Status update failed: ${updateErr.message}`); return; }
    setData(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  };

  const handleCreate = async () => {
    const email = createEmail.trim().toLowerCase();
    const code  = createCode.trim().toLowerCase();
    if (!email || !code) { setCreateError('Email and code are required.'); return; }

    const rate = parseFloat(createRate);
    if (isNaN(rate) || rate <= 0 || rate > 1) {
      setCreateError('Commission rate must be between 0.01 and 1.00 (e.g. 0.30 for 30%).');
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      // admin_create_affiliate atomically (single Postgres transaction):
      //   1. Looks up user_id from auth.users by email
      //   2. Inserts affiliates row (status = pending)
      //   3. Inserts default affiliate_links row (code = affiliate code,
      //      destination_url = /pricing, campaign = default)
      // If any step fails the transaction rolls back — no orphaned rows.
      const { data, error: rpcErr } = await supabase.rpc('admin_create_affiliate', {
        p_email:                      email,
        p_code:                       code,
        p_commission_rate:            rate,
        p_commission_duration_months: parseInt(createDuration, 10) || 12,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('Affiliate creation returned no result — please retry.');
      }

      setIsCreateOpen(false);
      setCreateEmail(''); setCreateCode(''); setCreateRate('0.30'); setCreateDuration('12');
      fetchData();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const closeCreate = () => { setIsCreateOpen(false); setCreateError(null); };

  // ── Filtering ─────────────────────────────────────────────────────────────────

  const filtered = data.filter(row => {
    const matchStatus = statusFilter === 'all' || row.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || (row.code          || '').toLowerCase().includes(q)
      || (row.contact_email || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const counts: Record<StatusFilter, number> = {
    all:       data.length,
    pending:   data.filter(d => d.status === 'pending').length,
    active:    data.filter(d => d.status === 'active').length,
    suspended: data.filter(d => d.status === 'suspended').length,
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-wide">Affiliate Partners</h2>
          <p className="text-sm text-nano-text mt-1">Manage accounts, commission settings, and access.</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-xs font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 transition-colors"
        >
          <Plus size={14} /> New Affiliate
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-nano-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors rounded-t -mb-px ${
              statusFilter === t.key
                ? 'bg-nano-panel border border-b-nano-panel border-nano-border text-nano-yellow'
                : 'text-nano-text hover:text-white'
            }`}
          >
            {t.label} <span className="ml-1 opacity-60">({counts[t.key]})</span>
          </button>
        ))}
      </div>

      <AdminSearchFilter value={search} onChange={setSearch} placeholder="Search code or email…" />

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded mb-6 font-mono text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded" />)}
        </div>
      ) : (
        <div className="bg-black border border-nano-border rounded-lg overflow-x-auto shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                <th className="p-4 font-bold">Code / Email</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Commission</th>
                <th className="p-4 font-bold">Links / Clicks</th>
                <th className="p-4 font-bold">Created</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 italic text-sm">
                    No affiliates found.
                  </td>
                </tr>
              ) : (
                filtered.map(row => {
                  const li = linksMap.get(row.id) || { linkCount: 0, totalClicks: 0 };
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-nano-border/50 hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/affiliates/${row.id}`)}
                    >
                      <td className="p-4">
                        <div className="font-mono font-bold text-nano-yellow text-sm">{row.code}</div>
                        <div className="text-[10px] text-nano-text mt-0.5">{row.contact_email || '—'}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[row.status] || 'text-gray-400'}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-white text-sm font-mono">
                          {(Number(row.commission_rate) * 100).toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-nano-text mt-0.5">
                          {row.commission_duration_months}mo
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-white text-sm">{li.linkCount} link{li.linkCount !== 1 ? 's' : ''}</div>
                        <div className="text-[10px] text-nano-text mt-0.5">{li.totalClicks.toLocaleString()} clicks</div>
                      </td>
                      <td className="p-4 text-[11px] text-nano-text font-mono">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 justify-end">
                          {row.status === 'pending' && (
                            <button onClick={e => handleQuickStatus(e, row.id, 'active')}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 border border-green-400/30 rounded hover:bg-green-400/20 transition-colors">
                              Activate
                            </button>
                          )}
                          {row.status === 'active' && (
                            <button onClick={e => handleQuickStatus(e, row.id, 'suspended')}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-400/10 border border-red-400/30 rounded hover:bg-red-400/20 transition-colors">
                              Suspend
                            </button>
                          )}
                          {row.status === 'suspended' && (
                            <button onClick={e => handleQuickStatus(e, row.id, 'active')}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30 rounded hover:bg-nano-yellow/20 transition-colors">
                              Reactivate
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/admin/affiliates/${row.id}`)}
                            className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300 bg-white/5 border border-nano-border rounded hover:bg-white/10 transition-colors flex items-center gap-1"
                          >
                            Detail <ChevronRight size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Affiliate Modal ── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-nano-panel border border-nano-border rounded-lg w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-nano-border">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-nano-yellow" />
                <span className="font-mono font-bold tracking-wide text-white">New Affiliate</span>
              </div>
              <button onClick={closeCreate} className="text-nano-text hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1.5">User Email *</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={e => {
                    setCreateEmail(e.target.value);
                    if (!createCode) setCreateCode(slugify(e.target.value));
                  }}
                  placeholder="partner@example.com"
                  className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow font-mono"
                />
                <p className="text-[10px] text-nano-text mt-1">Must be a registered CDS account.</p>
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1.5">Affiliate Code *</label>
                <input
                  type="text"
                  value={createCode}
                  onChange={e => setCreateCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="studio-jane"
                  className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow font-mono"
                />
                <p className="text-[10px] text-nano-text mt-1">Lowercase, numbers, hyphens only. Used in tracking URLs.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1.5">Commission Rate</label>
                  <input
                    type="number"
                    value={createRate}
                    onChange={e => setCreateRate(e.target.value)}
                    step="0.01" min="0.01" max="1"
                    className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white focus:outline-none focus:border-nano-yellow font-mono"
                  />
                  <p className="text-[10px] text-nano-text mt-1">0.30 = 30%</p>
                </div>
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1.5">Duration (months)</label>
                  <input
                    type="number"
                    value={createDuration}
                    onChange={e => setCreateDuration(e.target.value)}
                    step="1" min="1"
                    className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white focus:outline-none focus:border-nano-yellow font-mono"
                  />
                </div>
              </div>

              {createError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded font-mono">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !createEmail.trim() || !createCode.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-xs font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isCreating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  {isCreating ? 'Creating…' : 'Create Affiliate'}
                </button>
                <button
                  onClick={closeCreate}
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-nano-text border border-nano-border rounded hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AffiliatesAdmin;
