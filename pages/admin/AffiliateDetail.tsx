import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  ChevronLeft, Loader2, X, Plus, Link2, FileText,
  BarChart2, DollarSign, ShieldCheck, ShieldOff, ShieldAlert,
  Send, ExternalLink, RefreshCw,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    'text-green-400 bg-green-400/10 border border-green-400/30',
  pending:   'text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30',
  suspended: 'text-red-400 bg-red-400/10 border border-red-400/30',
};

const LEDGER_TYPE_COLORS: Record<string, string> = {
  earned:   'text-green-400 bg-green-400/10 border border-green-400/30',
  reversal: 'text-red-400 bg-red-400/10 border border-red-400/30',
};

const PAYOUT_STATUS_COLORS: Record<string, string> = {
  draft:     'text-nano-text bg-white/5 border border-nano-border',
  approved:  'text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30',
  paid:      'text-green-400 bg-green-400/10 border border-green-400/30',
  cancelled: 'text-red-400 bg-red-400/10 border border-red-400/30',
  pending:   'text-nano-text bg-white/5 border border-nano-border',
};

const fmt = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

type Tab = 'overview' | 'links' | 'commissions' | 'payouts' | 'notes';

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string | number; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-black border border-nano-border rounded-lg p-4">
    <div className="text-[10px] uppercase tracking-widest text-nano-text mb-1">{label}</div>
    <div className="text-2xl font-bold font-mono text-white">{value}</div>
    {sub && <div className="text-[10px] text-nano-text mt-1">{sub}</div>}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const AffiliateDetailAdmin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Core data
  const [affiliate, setAffiliate]   = useState<any>(null);
  const [stats, setStats]           = useState<any>(null);
  const [links, setLinks]           = useState<any[]>([]);
  const [ledger, setLedger]         = useState<any[]>([]);
  const [payoutItems, setPayoutItems] = useState<any[]>([]);
  const [notes, setNotes]           = useState<any[]>([]);

  // UI state
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [tab, setTab]               = useState<Tab>('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  // Status change
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Add note
  const [noteBody, setNoteBody]         = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteError, setNoteError]       = useState<string | null>(null);

  // Add link modal
  const [isLinkOpen,     setIsLinkOpen]     = useState(false);
  const [linkCode,       setLinkCode]       = useState('');
  const [linkDest,       setLinkDest]       = useState('/');
  const [linkCampaign,   setLinkCampaign]   = useState('');
  const [isAddingLink,   setIsAddingLink]   = useState(false);
  const [linkError,      setLinkError]      = useState<string | null>(null);

  // Edit settings
  const [isEditOpen,    setIsEditOpen]    = useState(false);
  const [editRate,      setEditRate]      = useState('');
  const [editDuration,  setEditDuration]  = useState('');
  const [editHold,      setEditHold]      = useState('');
  const [editMinPayout, setEditMinPayout] = useState('');
  const [editPaypal,    setEditPaypal]    = useState('');
  const [isSavingEdit,  setIsSavingEdit]  = useState(false);
  const [editError,     setEditError]     = useState<string | null>(null);

  // ── Load data ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [affRes, statsRes, linksRes, ledgerRes, payoutsRes, notesRes] =
        await Promise.allSettled([
          supabase.from('affiliates').select('*').eq('id', id).single(),
          supabase.rpc('get_affiliate_dashboard_stats', { p_affiliate_id: id }),
          supabase.from('affiliate_links').select('*').eq('affiliate_id', id).order('created_at', { ascending: false }),
          supabase.from('commission_ledger')
            .select('id, type, amount_cents, currency, hold_until, stripe_event_id, stripe_invoice_id, created_at, payout_batch_id')
            .eq('affiliate_id', id)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase.from('payout_items')
            .select('id, amount_cents, status, paypal_email, created_at, payout_batches(id, status, paid_at, total_amount_cents)')
            .eq('affiliate_id', id)
            .order('created_at', { ascending: false }),
          supabase.from('affiliate_notes')
            .select('id, body, author_email, created_at')
            .eq('affiliate_id', id)
            .order('created_at', { ascending: false }),
        ]);

      if (affRes.status === 'fulfilled' && !affRes.value.error) {
        const aff = affRes.value.data;
        setAffiliate(aff);
        setEditRate(String(aff.commission_rate));
        setEditDuration(String(aff.commission_duration_months));
        setEditHold(String(aff.payout_hold_days));
        setEditMinPayout(String(aff.minimum_payout_cents));
        setEditPaypal(aff.paypal_email || '');
      } else {
        throw new Error('Affiliate not found');
      }

      if (statsRes.status === 'fulfilled' && !statsRes.value.error) {
        setStats((statsRes.value.data as any[])?.[0] ?? null);
      }
      if (linksRes.status === 'fulfilled' && !linksRes.value.error) {
        setLinks(linksRes.value.data || []);
      }
      if (ledgerRes.status === 'fulfilled' && !ledgerRes.value.error) {
        setLedger(ledgerRes.value.data || []);
      }
      if (payoutsRes.status === 'fulfilled' && !payoutsRes.value.error) {
        setPayoutItems(payoutsRes.value.data || []);
      }
      if (notesRes.status === 'fulfilled' && !notesRes.value.error) {
        setNotes(notesRes.value.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load affiliate');
    } finally {
      setLoading(false);
    }
  }, [id, refreshKey]);

  useEffect(() => { load(); }, [load]);

  // ── Status change ────────────────────────────────────────────────────────────

  const handleStatus = async (newStatus: 'active' | 'suspended' | 'pending') => {
    if (!affiliate) return;
    setIsChangingStatus(true);
    const { error: err } = await supabase
      .from('affiliates').update({ status: newStatus }).eq('id', id);
    setIsChangingStatus(false);
    if (err) { alert(`Status update failed: ${err.message}`); return; }
    setAffiliate((prev: any) => ({ ...prev, status: newStatus }));
  };

  // ── Add note ─────────────────────────────────────────────────────────────────

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;
    setIsAddingNote(true);
    setNoteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error: err } = await supabase.from('affiliate_notes').insert([{
        affiliate_id: id,
        author_email: session?.user?.email ?? null,
        body:         noteBody.trim(),
      }]);
      if (err) throw err;
      setNoteBody('');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setNoteError(err.message);
    } finally {
      setIsAddingNote(false);
    }
  };

  // ── Add link ─────────────────────────────────────────────────────────────────

  const handleAddLink = async () => {
    const code = linkCode.trim().toLowerCase();
    if (!code) { setLinkError('Code is required.'); return; }
    setIsAddingLink(true);
    setLinkError(null);
    try {
      // Check uniqueness
      const { data: clash } = await supabase
        .from('affiliate_links').select('id').ilike('code', code).maybeSingle();
      if (clash) throw new Error(`Code "${code}" is already in use.`);

      const { error: err } = await supabase.from('affiliate_links').insert([{
        affiliate_id:    id,
        code,
        destination_url: linkDest.trim() || '/',
        campaign:        linkCampaign.trim() || null,
        is_active:       true,
      }]);
      if (err) throw err;
      setIsLinkOpen(false); setLinkCode(''); setLinkDest('/'); setLinkCampaign('');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setLinkError(err.message);
    } finally {
      setIsAddingLink(false);
    }
  };

  // ── Toggle link active ────────────────────────────────────────────────────────

  const handleToggleLink = async (linkId: string, current: boolean) => {
    const { error: err } = await supabase
      .from('affiliate_links').update({ is_active: !current }).eq('id', linkId);
    if (err) { alert(err.message); return; }
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, is_active: !current } : l));
  };

  // ── Save settings ─────────────────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const rate = parseFloat(editRate);
      if (isNaN(rate) || rate <= 0 || rate > 1) throw new Error('Commission rate must be 0.01–1.00');
      const { error: err } = await supabase.from('affiliates').update({
        commission_rate:            rate,
        commission_duration_months: parseInt(editDuration, 10),
        payout_hold_days:           parseInt(editHold, 10),
        minimum_payout_cents:       parseInt(editMinPayout, 10),
        paypal_email:               editPaypal.trim() || null,
      }).eq('id', id);
      if (err) throw err;
      setIsEditOpen(false);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 size={28} className="animate-spin text-nano-yellow" />
      </div>
    );
  }

  if (error || !affiliate) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded font-mono text-sm">
          {error || 'Affiliate not found'}
        </div>
        <button onClick={() => navigate('/admin/affiliates')} className="mt-4 text-nano-text hover:text-white text-sm flex items-center gap-1">
          <ChevronLeft size={14} /> Back to Affiliates
        </button>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview',    label: 'Overview'    },
    { key: 'links',       label: 'Links',       count: links.length    },
    { key: 'commissions', label: 'Commissions', count: ledger.length   },
    { key: 'payouts',     label: 'Payouts',     count: payoutItems.length },
    { key: 'notes',       label: 'Notes',       count: notes.length    },
  ];

  const isPayableDate = (holdUntil: string) => new Date(holdUntil) <= new Date();
  const ledgerStatus  = (row: any) => {
    if (row.payout_batch_id) return { label: 'Paid/Batched', cls: 'text-green-400' };
    if (isPayableDate(row.hold_until)) return { label: 'Payable', cls: 'text-nano-yellow' };
    return { label: 'In Hold', cls: 'text-nano-text' };
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/admin/affiliates')}
            className="flex items-center gap-1 text-nano-text hover:text-white text-xs mb-3 transition-colors"
          >
            <ChevronLeft size={14} /> Affiliates
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold font-mono tracking-wide text-nano-yellow">
              {affiliate.code}
            </h2>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[affiliate.status] || ''}`}>
              {affiliate.status}
            </span>
          </div>
          <div className="text-sm text-nano-text mt-1">{affiliate.contact_email || affiliate.user_id}</div>
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-2">
          {isChangingStatus && <Loader2 size={14} className="animate-spin text-nano-text" />}
          {affiliate.status !== 'active' && (
            <button
              onClick={() => handleStatus('active')}
              disabled={isChangingStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 border border-green-400/30 rounded hover:bg-green-400/20 transition-colors disabled:opacity-40"
            >
              <ShieldCheck size={12} /> Activate
            </button>
          )}
          {affiliate.status === 'active' && (
            <button
              onClick={() => handleStatus('suspended')}
              disabled={isChangingStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-400/10 border border-red-400/30 rounded hover:bg-red-400/20 transition-colors disabled:opacity-40"
            >
              <ShieldOff size={12} /> Suspend
            </button>
          )}
          <button
            onClick={() => setIsEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-nano-text bg-white/5 border border-nano-border rounded hover:text-white hover:bg-white/10 transition-colors"
          >
            Edit Settings
          </button>
          <button onClick={() => setRefreshKey(k => k + 1)} title="Refresh" className="p-1.5 text-nano-text hover:text-white border border-nano-border rounded bg-white/5 hover:bg-white/10 transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Clicks"      value={(stats.clicks_count ?? 0).toLocaleString()} />
          <StatCard label="Conversions"       value={(stats.converted_clicks_count ?? 0).toLocaleString()} />
          <StatCard label="Active Referrals"  value={(stats.referrals_count ?? 0).toLocaleString()} sub={`${stats.paid_customers_count ?? 0} paid customers`} />
          <StatCard label="Net Payable"       value={fmt(stats.payable_commission_cents)}         sub={`${fmt(stats.pending_commission_cents)} in hold · ${fmt(stats.paid_commission_cents)} paid`} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-0 border-b border-nano-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors rounded-t -mb-px ${
              tab === t.key
                ? 'bg-nano-panel border border-b-nano-panel border-nano-border text-nano-yellow'
                : 'text-nano-text hover:text-white'
            }`}
          >
            {t.label}
            {t.count != null && <span className="ml-1 opacity-60">({t.count})</span>}
          </button>
        ))}
      </div>

      <div className="mt-6">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black border border-nano-border rounded-lg p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-nano-text mb-3">Commission Settings</h3>
              {[
                ['Rate',         `${(Number(affiliate.commission_rate) * 100).toFixed(0)}%`],
                ['Duration',     `${affiliate.commission_duration_months} months`],
                ['Payout Hold',  `${affiliate.payout_hold_days} days`],
                ['Minimum Payout', fmt(affiliate.minimum_payout_cents)],
                ['Attribution Window', `${affiliate.attribution_window_days} days`],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-sm">
                  <span className="text-nano-text">{label}</span>
                  <span className="text-white font-mono">{val}</span>
                </div>
              ))}
            </div>
            <div className="bg-black border border-nano-border rounded-lg p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-nano-text mb-3">Account Info</h3>
              {[
                ['Affiliate ID',  affiliate.id],
                ['User ID',       affiliate.user_id],
                ['PayPal Email',  affiliate.paypal_email || '—'],
                ['Created',       affiliate.created_at ? new Date(affiliate.created_at).toLocaleString() : '—'],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-sm gap-4">
                  <span className="text-nano-text flex-shrink-0">{label}</span>
                  <span className="text-white font-mono text-[11px] truncate text-right">{val as string}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Links tab ── */}
        {tab === 'links' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setIsLinkOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-xs font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 transition-colors"
              >
                <Plus size={12} /> Add Link
              </button>
            </div>
            <div className="bg-black border border-nano-border rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                    <th className="p-4 font-bold">Code</th>
                    <th className="p-4 font-bold">Destination</th>
                    <th className="p-4 font-bold">Campaign</th>
                    <th className="p-4 font-bold">Clicks</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {links.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-500 italic text-sm">No links yet.</td></tr>
                  ) : links.map(l => (
                    <tr key={l.id} className="border-b border-nano-border/50 hover:bg-white/5">
                      <td className="p-4 font-mono text-nano-yellow text-sm">{l.code}</td>
                      <td className="p-4 text-xs text-nano-text truncate max-w-[180px]">{l.destination_url}</td>
                      <td className="p-4 text-xs text-nano-text">{l.campaign || '—'}</td>
                      <td className="p-4 text-sm text-white font-mono">{(l.click_count || 0).toLocaleString()}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${l.is_active ? 'text-green-400 bg-green-400/10 border border-green-400/30' : 'text-nano-text bg-white/5 border border-nano-border'}`}>
                          {l.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleToggleLink(l.id, l.is_active)}
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-nano-border rounded text-nano-text hover:text-white hover:bg-white/5 transition-colors"
                        >
                          {l.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Commissions tab ── */}
        {tab === 'commissions' && (
          <div className="bg-black border border-nano-border rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                  <th className="p-4 font-bold">Type</th>
                  <th className="p-4 font-bold">Amount</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Hold Until</th>
                  <th className="p-4 font-bold">Stripe Event</th>
                  <th className="p-4 font-bold">Created</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500 italic text-sm">No commission history.</td></tr>
                ) : ledger.map(row => {
                  const { label, cls } = ledgerStatus(row);
                  return (
                    <tr key={row.id} className="border-b border-nano-border/50 hover:bg-white/5">
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${LEDGER_TYPE_COLORS[row.type] || ''}`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-white text-sm">{fmt(row.amount_cents)}</td>
                      <td className={`p-4 text-xs font-mono font-bold ${cls}`}>{label}</td>
                      <td className="p-4 text-[11px] text-nano-text font-mono">
                        {row.hold_until ? new Date(row.hold_until).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-4 text-[10px] text-gray-500 font-mono truncate max-w-[100px]" title={row.stripe_event_id}>
                        {row.stripe_event_id ? row.stripe_event_id.slice(0, 14) + '…' : '—'}
                      </td>
                      <td className="p-4 text-[11px] text-nano-text font-mono">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ledger.length === 50 && (
              <div className="p-4 text-center text-[10px] text-nano-text italic">Showing last 50 rows.</div>
            )}
          </div>
        )}

        {/* ── Payouts tab ── */}
        {tab === 'payouts' && (
          <div className="bg-black border border-nano-border rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                  <th className="p-4 font-bold">Batch Status</th>
                  <th className="p-4 font-bold">Amount</th>
                  <th className="p-4 font-bold">Item Status</th>
                  <th className="p-4 font-bold">PayPal Email</th>
                  <th className="p-4 font-bold">Paid At</th>
                </tr>
              </thead>
              <tbody>
                {payoutItems.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-500 italic text-sm">No payouts yet.</td></tr>
                ) : payoutItems.map(pi => {
                  const batch = (pi.payout_batches as any) || {};
                  return (
                    <tr key={pi.id} className="border-b border-nano-border/50 hover:bg-white/5">
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${PAYOUT_STATUS_COLORS[batch.status] || ''}`}>
                          {batch.status || '—'}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-white text-sm">{fmt(pi.amount_cents)}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${PAYOUT_STATUS_COLORS[pi.status] || ''}`}>
                          {pi.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-nano-text font-mono">{pi.paypal_email || '—'}</td>
                      <td className="p-4 text-[11px] text-nano-text font-mono">
                        {batch.paid_at ? new Date(batch.paid_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Notes tab ── */}
        {tab === 'notes' && (
          <div className="space-y-4">
            {/* Add note form */}
            <div className="bg-black border border-nano-border rounded-lg p-4">
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-2">Add Internal Note</label>
              <textarea
                value={noteBody}
                onChange={e => setNoteBody(e.target.value)}
                rows={3}
                placeholder="Internal note visible to admins only…"
                className="w-full px-3 py-2 bg-nano-dark border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow resize-none"
              />
              {noteError && <p className="text-red-400 text-xs mt-1">{noteError}</p>}
              <button
                onClick={handleAddNote}
                disabled={isAddingNote || !noteBody.trim()}
                className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-xs font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 transition-colors disabled:opacity-40"
              >
                {isAddingNote ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {isAddingNote ? 'Saving…' : 'Add Note'}
              </button>
            </div>

            {/* Notes list */}
            {notes.length === 0 ? (
              <p className="text-center text-gray-500 italic text-sm py-8">No notes yet.</p>
            ) : (
              notes.map(n => (
                <div key={n.id} className="bg-black border border-nano-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-nano-yellow font-mono">{n.author_email || 'Admin'}</span>
                    <span className="text-[10px] text-nano-text font-mono">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                  <p className="text-sm text-white whitespace-pre-wrap">{n.body}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Add Link Modal ── */}
      {isLinkOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-nano-panel border border-nano-border rounded-lg w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-nano-border">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-nano-yellow" />
                <span className="font-mono font-bold text-white text-sm">Add Tracking Link</span>
              </div>
              <button onClick={() => { setIsLinkOpen(false); setLinkError(null); }} className="text-nano-text hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Link Code *</label>
                <input type="text" value={linkCode}
                  onChange={e => setLinkCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder={`${affiliate.code}-promo`}
                  className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow font-mono" />
              </div>
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Destination URL</label>
                <input type="text" value={linkDest} onChange={e => setLinkDest(e.target.value)}
                  placeholder="/"
                  className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow font-mono" />
              </div>
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Campaign Label</label>
                <input type="text" value={linkCampaign} onChange={e => setLinkCampaign(e.target.value)}
                  placeholder="twitter-bio"
                  className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow" />
              </div>
              {linkError && <p className="text-red-400 text-xs font-mono">{linkError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={handleAddLink} disabled={isAddingLink || !linkCode.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-xs font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 disabled:opacity-40">
                  {isAddingLink ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  {isAddingLink ? 'Adding…' : 'Add Link'}
                </button>
                <button onClick={() => { setIsLinkOpen(false); setLinkError(null); }}
                  className="px-3 py-2 text-xs font-bold uppercase text-nano-text border border-nano-border rounded hover:text-white hover:bg-white/5">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Settings Modal ── */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-nano-panel border border-nano-border rounded-lg w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-nano-border">
              <span className="font-mono font-bold text-white text-sm">Edit Commission Settings</span>
              <button onClick={() => setIsEditOpen(false)} className="text-nano-text hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                ['Commission Rate', editRate, setEditRate, 'e.g. 0.30', '0.01', '1', '0.01'],
                ['Duration (months)', editDuration, setEditDuration, '12', '1', '120', '1'],
                ['Payout Hold (days)', editHold, setEditHold, '30', '0', '365', '1'],
                ['Min Payout (cents)', editMinPayout, setEditMinPayout, '5000', '0', '100000', '100'],
              ].map(([label, val, setter, placeholder, min, max, step]: any) => (
                <div key={label}>
                  <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</label>
                  <input type="number" value={val} onChange={e => setter(e.target.value)}
                    placeholder={placeholder} min={min} max={max} step={step}
                    className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white focus:outline-none focus:border-nano-yellow font-mono" />
                </div>
              ))}
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">PayPal Email</label>
                <input type="email" value={editPaypal} onChange={e => setEditPaypal(e.target.value)}
                  placeholder="payouts@example.com"
                  className="w-full px-3 py-2 bg-black border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow font-mono" />
              </div>
              {editError && <p className="text-red-400 text-xs font-mono">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveSettings} disabled={isSavingEdit}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-xs font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 disabled:opacity-40">
                  {isSavingEdit ? <Loader2 size={12} className="animate-spin" /> : null}
                  {isSavingEdit ? 'Saving…' : 'Save Settings'}
                </button>
                <button onClick={() => setIsEditOpen(false)}
                  className="px-3 py-2 text-xs font-bold uppercase text-nano-text border border-nano-border rounded hover:text-white hover:bg-white/5">
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

export default AffiliateDetailAdmin;
