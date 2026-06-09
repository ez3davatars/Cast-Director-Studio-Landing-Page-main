import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, Search, UserCheck, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'withdrawn';

const moneyToCents = (value: string) => Math.round((parseFloat(value || '0') || 0) * 100);
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '-';
const slugFrom = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40) || 'affiliate';

const AffiliateApplicationsAdmin: React.FC = () => {
  const [applications, setApplications] = useState<any[]>([]);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [code, setCode] = useState('');
  const [commissionRate, setCommissionRate] = useState('0.30');
  const [duration, setDuration] = useState('12');
  const [attributionWindow, setAttributionWindow] = useState('60');
  const [payoutHold, setPayoutHold] = useState('30');
  const [minimumPayout, setMinimumPayout] = useState('50');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, affiliatesRes] = await Promise.all([
        supabase
          .from('affiliate_applications')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('affiliates')
          .select('id, user_id, code, status, contact_email'),
      ]);
      if (appsRes.error) throw appsRes.error;
      if (affiliatesRes.error) throw affiliatesRes.error;
      setApplications(appsRes.data || []);
      setAffiliates(affiliatesRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load affiliate applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadApplications(); }, [loadApplications]);

  const openApplication = (app: any) => {
    const defaultCode = slugFrom(app.full_name || app.email?.split('@')[0] || '');
    setSelected(app);
    setAdminNotes(app.admin_notes || '');
    setCode(defaultCode);
    setCommissionRate('0.30');
    setDuration('12');
    setAttributionWindow('60');
    setPayoutHold('30');
    setMinimumPayout('50');
    setActionError(null);
    setActionSuccess(null);
  };

  const affiliateByUser = useMemo(() => new Map(affiliates.map(row => [row.user_id, row])), [affiliates]);

  const filtered = applications.filter(app => {
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    const query = search.toLowerCase();
    const matchesSearch = !query
      || (app.email || '').toLowerCase().includes(query)
      || (app.full_name || '').toLowerCase().includes(query)
      || (app.website_url || '').toLowerCase().includes(query)
      || (app.social_url || '').toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  const updateApplicationStatus = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let affiliateId = affiliateByUser.get(selected.user_id)?.id;

      if (status === 'approved') {
        const rate = parseFloat(commissionRate);
        if (!code.trim()) throw new Error('Affiliate code is required.');
        if (Number.isNaN(rate) || rate <= 0 || rate > 1) throw new Error('Commission rate must be between 0.01 and 1.00.');

        if (!affiliateId) {
          const { data, error: rpcErr } = await supabase.rpc('admin_create_affiliate', {
            p_email: selected.email,
            p_code: code.trim().toLowerCase(),
            p_commission_rate: rate,
            p_commission_duration_months: parseInt(duration, 10) || 12,
          });
          if (rpcErr) throw rpcErr;
          affiliateId = Array.isArray(data) ? data[0]?.affiliate_id : data?.affiliate_id;
        }

        if (affiliateId) {
          const { error: affiliateErr } = await supabase
            .from('affiliates')
            .update({
              status: 'active',
              commission_rate: rate,
              commission_duration_months: parseInt(duration, 10) || 12,
              attribution_window_days: parseInt(attributionWindow, 10) || 60,
              payout_hold_days: parseInt(payoutHold, 10) || 30,
              minimum_payout_cents: moneyToCents(minimumPayout),
            })
            .eq('id', affiliateId);
          if (affiliateErr) throw affiliateErr;
        }
      }

      const { error: appErr } = await supabase
        .from('affiliate_applications')
        .update({
          status,
          admin_notes: adminNotes.trim() || null,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selected.id);
      if (appErr) throw appErr;

      setActionSuccess(status === 'approved' ? 'Application approved and affiliate activated.' : 'Application rejected.');
      await loadApplications();
      setSelected((prev: any) => prev ? { ...prev, status, admin_notes: adminNotes } : prev);
    } catch (err: any) {
      setActionError(err.message || `Failed to ${status} application.`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-wide">Affiliate Applications</h2>
          <p className="text-sm text-nano-text mt-1">Review partner applications and approve affiliate access.</p>
        </div>
        <button
          type="button"
          onClick={loadApplications}
          className="inline-flex items-center gap-2 rounded border border-nano-border bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-text hover:text-white"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-4 text-sm font-mono text-red-400">{error}</div>}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected', 'withdrawn'] as StatusFilter[]).map(status => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${statusFilter === status ? 'border-nano-yellow/40 bg-nano-yellow/10 text-nano-yellow' : 'border-nano-border bg-white/5 text-nano-text hover:text-white'}`}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-80">
          <Search size={14} className="absolute left-3 top-2.5 text-nano-text" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search applicants"
            className="w-full rounded border border-nano-border bg-black py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-nano-yellow focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 size={28} className="animate-spin text-nano-yellow" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-nano-border bg-black p-12 text-center text-sm italic text-gray-500">
          No affiliate applications found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
          <div className="rounded-lg border border-nano-border bg-black overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-nano-border bg-black/40 text-[10px] uppercase tracking-widest text-nano-text">
                  <th className="p-4">Applicant</th>
                  <th className="p-4">Audience</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Submitted</th>
                  <th className="p-4">Affiliate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(app => {
                  const existingAffiliate = affiliateByUser.get(app.user_id);
                  return (
                    <tr key={app.id} onClick={() => openApplication(app)} className="cursor-pointer border-b border-nano-border/50 hover:bg-white/5">
                      <td className="p-4">
                        <div className="font-bold text-white">{app.full_name || app.email}</div>
                        <div className="text-xs font-mono text-nano-text">{app.email}</div>
                      </td>
                      <td className="p-4 text-sm text-nano-text max-w-[320px]">
                        <div className="line-clamp-2">{app.audience_description || '-'}</div>
                      </td>
                      <td className="p-4">
                        <span className="rounded border border-nano-border bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-nano-text">
                          {app.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-mono text-nano-text">{dateTime(app.created_at)}</td>
                      <td className="p-4 text-xs font-mono text-nano-text">{existingAffiliate?.code || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside className="rounded-lg border border-nano-border bg-black/70 p-5">
            {!selected ? (
              <div className="py-12 text-center text-sm text-nano-text">
                <UserCheck size={28} className="mx-auto mb-3 text-nano-yellow" />
                Select an application to review.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{selected.full_name || selected.email}</h3>
                  <p className="text-xs font-mono text-nano-text">{selected.email}</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-nano-yellow">{selected.status}</p>
                </div>

                {[
                  ['Website', selected.website_url],
                  ['Social', selected.social_url],
                  ['Audience size', selected.estimated_audience_size],
                  ['Country', selected.primary_country],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
                    <div className="break-words text-sm text-nano-text">{value || '-'}</div>
                  </div>
                ))}

                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Audience Description</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-nano-text">{selected.audience_description || '-'}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Promotion Plan</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-nano-text">{selected.promotion_plan || '-'}</p>
                </div>

                {selected.status === 'pending' && (
                  <div className="space-y-3 border-t border-nano-border pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs uppercase tracking-wider text-gray-500">Code
                        <input value={code} onChange={e => setCode(slugFrom(e.target.value))} className="mt-1 w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none" />
                      </label>
                      <label className="text-xs uppercase tracking-wider text-gray-500">Rate
                        <input value={commissionRate} onChange={e => setCommissionRate(e.target.value)} className="mt-1 w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none" />
                      </label>
                      <label className="text-xs uppercase tracking-wider text-gray-500">Duration
                        <input value={duration} onChange={e => setDuration(e.target.value)} className="mt-1 w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none" />
                      </label>
                      <label className="text-xs uppercase tracking-wider text-gray-500">Attribution
                        <input value={attributionWindow} onChange={e => setAttributionWindow(e.target.value)} className="mt-1 w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none" />
                      </label>
                      <label className="text-xs uppercase tracking-wider text-gray-500">Hold days
                        <input value={payoutHold} onChange={e => setPayoutHold(e.target.value)} className="mt-1 w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none" />
                      </label>
                      <label className="text-xs uppercase tracking-wider text-gray-500">Min payout $
                        <input value={minimumPayout} onChange={e => setMinimumPayout(e.target.value)} className="mt-1 w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none" />
                      </label>
                    </div>
                  </div>
                )}

                <label className="block text-xs uppercase tracking-wider text-gray-500">
                  Admin Notes
                  <textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    rows={4}
                    className="mt-1 w-full resize-none rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                  />
                </label>

                {actionError && <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{actionError}</div>}
                {actionSuccess && <div className="rounded border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">{actionSuccess}</div>}

                {selected.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateApplicationStatus('approved')}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 rounded border border-green-400/30 bg-green-400/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-green-300 hover:bg-green-400/20 disabled:opacity-50"
                    >
                      {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => updateApplicationStatus('rejected')}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default AffiliateApplicationsAdmin;
