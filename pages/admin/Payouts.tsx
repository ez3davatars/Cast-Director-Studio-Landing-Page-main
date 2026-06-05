import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, DollarSign, CheckCircle, X, FileText } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BATCH_STATUS_COLORS: Record<string, string> = {
  draft:     'text-nano-text  bg-white/5      border border-nano-border',
  approved:  'text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30',
  paid:      'text-green-400  bg-green-400/10  border border-green-400/30',
  cancelled: 'text-red-400   bg-red-400/10    border border-red-400/30',
};

const fmt = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

type PayoutsTab = 'payable' | 'batches';

interface PayableRow {
  affiliate_id:  string;
  code:          string;
  contact_email: string;
  paypal_email:  string | null;
  net_cents:     number;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PayoutsAdmin: React.FC = () => {
  const [tab, setTab] = useState<PayoutsTab>('payable');

  // Payable tab state
  const [payableRows, setPayableRows]       = useState<PayableRow[]>([]);
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [loadingPayable, setLoadingPayable] = useState(true);
  const [payableError, setPayableError]     = useState<string | null>(null);

  // Batch creation state
  const [batchNotes,      setBatchNotes]      = useState('');
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [createBatchErr,  setCreateBatchErr]  = useState<string | null>(null);
  const [createBatchOk,   setCreateBatchOk]   = useState<string | null>(null);

  // Batches tab state
  const [batches,        setBatches]        = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [batchesError,   setBatchesError]   = useState<string | null>(null);

  // Batch action state
  const [batchActionId,  setBatchActionId]  = useState<string | null>(null);
  const [batchActionErr, setBatchActionErr] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  // ── Load payable commissions ──────────────────────────────────────────────────

  const loadPayable = useCallback(async () => {
    setLoadingPayable(true);
    setPayableError(null);
    setSelected(new Set());
    try {
      const now = new Date().toISOString();

      const [ledgerRes, affiliatesRes] = await Promise.allSettled([
        supabase
          .from('commission_ledger')
          .select('affiliate_id, type, amount_cents')
          .is('payout_batch_id', null)
          .lte('hold_until', now),
        supabase
          .from('affiliates')
          .select('id, code, contact_email, paypal_email, minimum_payout_cents')
          .eq('status', 'active'),
      ]);

      const ledgerData =
        ledgerRes.status === 'fulfilled' && !ledgerRes.value.error
          ? ledgerRes.value.data || []
          : [];

      const affiliatesData =
        affiliatesRes.status === 'fulfilled' && !affiliatesRes.value.error
          ? affiliatesRes.value.data || []
          : [];

      // Compute net per affiliate
      const netMap = new Map<string, number>();
      for (const row of ledgerData) {
        const cur = netMap.get(row.affiliate_id) ?? 0;
        netMap.set(
          row.affiliate_id,
          cur + (row.type === 'earned' ? row.amount_cents : -row.amount_cents)
        );
      }

      const affMap = new Map(affiliatesData.map((a: any) => [a.id, a]));

      const rows: PayableRow[] = [];
      for (const [aff_id, net] of netMap.entries()) {
        if (net <= 0) continue;
        const aff = affMap.get(aff_id);
        if (!aff) continue;
        // Only include if net >= minimum payout
        if (net < (aff.minimum_payout_cents ?? 5000)) continue;
        rows.push({
          affiliate_id:  aff_id,
          code:          aff.code,
          contact_email: aff.contact_email || '',
          paypal_email:  aff.paypal_email || null,
          net_cents:     net,
        });
      }

      // Sort by net_cents descending
      rows.sort((a, b) => b.net_cents - a.net_cents);
      setPayableRows(rows);
    } catch (err: any) {
      setPayableError(err.message || 'Failed to load payable commissions');
    } finally {
      setLoadingPayable(false);
    }
  }, [refreshKey]);

  // ── Load batch history ────────────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    setBatchesError(null);
    try {
      const { data, error: err } = await supabase
        .from('payout_batches')
        .select('id, status, total_amount_cents, notes, created_at, approved_at, paid_at, payout_items(count)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (err) throw err;
      setBatches(data || []);
    } catch (err: any) {
      setBatchesError(err.message || 'Failed to load batches');
    } finally {
      setLoadingBatches(false);
    }
  }, [refreshKey]);

  useEffect(() => { loadPayable(); }, [loadPayable]);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  // ── Batch creation ────────────────────────────────────────────────────────────

  const handleCreateBatch = async () => {
    const selectedIds = [...selected];
    if (selectedIds.length === 0) { setCreateBatchErr('Select at least one affiliate.'); return; }

    setIsCreatingBatch(true);
    setCreateBatchErr(null);
    setCreateBatchOk(null);

    try {
      // admin_create_affiliate_payout_batch atomically (single Postgres transaction):
      //   1. Verifies caller is admin
      //   2. Finds eligible commission_ledger rows per affiliate
      //      (payout_batch_id IS NULL AND hold_until <= now())
      //   3. Enforces each affiliate's minimum_payout_cents
      //   4. Creates payout_batches row
      //   5. Creates payout_items rows
      //   6. Assigns commission_ledger.payout_batch_id + payout_item_id
      //      (immutability trigger allows these two columns to be updated)
      // Full rollback on any failure — no partial batches possible.
      const { data, error: rpcErr } = await supabase.rpc(
        'admin_create_affiliate_payout_batch',
        {
          p_affiliate_ids: selectedIds,
          p_notes:         batchNotes.trim() || null,
        }
      );
      if (rpcErr) throw new Error(rpcErr.message);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('Batch creation returned no result — please retry.');
      }

      const result = Array.isArray(data) ? data[0] : data;
      const msg = `Draft batch created: ${result.affiliate_count} affiliate(s), ${fmt(result.total_amount_cents)} total.`;
      setCreateBatchOk(msg);
      setBatchNotes('');
      setRefreshKey(k => k + 1);
      setTimeout(() => { setCreateBatchOk(null); setTab('batches'); }, 2500);
    } catch (err: any) {
      setCreateBatchErr(err.message);
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // ── Batch status transitions ──────────────────────────────────────────────────

  const handleBatchAction = async (
    batchId: string,
    action: 'approve' | 'mark_paid' | 'cancel'
  ) => {
    setBatchActionId(batchId);
    setBatchActionErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const adminId = session?.user?.id ?? null;

      const updates: any = {};
      if (action === 'approve') {
        updates.status = 'approved';
        updates.approved_by = adminId;
        updates.approved_at = new Date().toISOString();
      } else if (action === 'mark_paid') {
        updates.status = 'paid';
        updates.paid_at = new Date().toISOString();
        // Also mark all payout_items as paid
        await supabase
          .from('payout_items')
          .update({ status: 'paid' })
          .eq('batch_id', batchId);
      } else if (action === 'cancel') {
        if (!confirm('Cancel this batch? Commission ledger rows will be released back to payable.')) {
          setBatchActionId(null);
          return;
        }
        updates.status = 'cancelled';
        // Release commission rows from this batch
        await supabase
          .from('commission_ledger')
          .update({ payout_batch_id: null, payout_item_id: null })
          .eq('payout_batch_id', batchId);
      }

      const { error: updateErr } = await supabase
        .from('payout_batches')
        .update(updates)
        .eq('id', batchId);
      if (updateErr) throw updateErr;

      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setBatchActionErr(`${batchId}: ${err.message}`);
    } finally {
      setBatchActionId(null);
    }
  };

  // ── Toggle selection ──────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === payableRows.length) setSelected(new Set());
    else setSelected(new Set(payableRows.map(r => r.affiliate_id)));
  };

  const selectedTotal = payableRows
    .filter(r => selected.has(r.affiliate_id))
    .reduce((s, r) => s + r.net_cents, 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold font-mono tracking-wide">Payout Management</h2>
        <p className="text-sm text-nano-text mt-1">
          Review payable commissions, create draft batches, and record manual payouts.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-nano-border">
        {(['payable', 'batches'] as PayoutsTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors rounded-t -mb-px ${
              tab === t
                ? 'bg-nano-panel border border-b-nano-panel border-nano-border text-nano-yellow'
                : 'text-nano-text hover:text-white'
            }`}>
            {t === 'payable' ? 'Payable' : 'Batch History'}
          </button>
        ))}
      </div>

      {/* ── Payable tab ── */}
      {tab === 'payable' && (
        <div className="space-y-4">
          {payableError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded font-mono text-sm">
              {payableError}
            </div>
          )}

          {loadingPayable ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded" />)}
            </div>
          ) : (
            <>
              {payableRows.length === 0 ? (
                <div className="bg-black border border-nano-border rounded-lg p-12 text-center">
                  <DollarSign size={32} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 italic text-sm">No affiliates with payable commissions.</p>
                  <p className="text-[10px] text-nano-text mt-1">Payable = past hold period, meets minimum, not yet batched.</p>
                </div>
              ) : (
                <>
                  <div className="bg-black border border-nano-border rounded-lg overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                          <th className="p-4 w-10">
                            <input
                              type="checkbox"
                              checked={selected.size === payableRows.length && payableRows.length > 0}
                              onChange={toggleAll}
                              className="accent-yellow-400"
                            />
                          </th>
                          <th className="p-4 font-bold">Affiliate</th>
                          <th className="p-4 font-bold">PayPal Email</th>
                          <th className="p-4 font-bold text-right">Net Payable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payableRows.map(row => (
                          <tr
                            key={row.affiliate_id}
                            onClick={() => toggleSelect(row.affiliate_id)}
                            className={`border-b border-nano-border/50 cursor-pointer transition-colors ${selected.has(row.affiliate_id) ? 'bg-nano-yellow/5' : 'hover:bg-white/5'}`}
                          >
                            <td className="p-4 w-10">
                              <input
                                type="checkbox"
                                checked={selected.has(row.affiliate_id)}
                                onChange={() => toggleSelect(row.affiliate_id)}
                                onClick={e => e.stopPropagation()}
                                className="accent-yellow-400"
                              />
                            </td>
                            <td className="p-4">
                              <div className="font-mono font-bold text-nano-yellow text-sm">{row.code}</div>
                              <div className="text-[10px] text-nano-text mt-0.5">{row.contact_email || '—'}</div>
                            </td>
                            <td className="p-4 text-xs text-nano-text font-mono">
                              {row.paypal_email || <span className="text-red-400 italic">No PayPal email set</span>}
                            </td>
                            <td className="p-4 text-right">
                              <span className="font-mono font-bold text-white text-sm">{fmt(row.net_cents)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-nano-border bg-white/5">
                          <td colSpan={3} className="p-4 text-xs font-bold uppercase tracking-wider text-nano-text">
                            {selected.size > 0 ? `${selected.size} selected` : 'Select affiliates to batch'}
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-nano-yellow">
                            {selected.size > 0 ? fmt(selectedTotal) : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Batch creation form */}
                  <div className="bg-black border border-nano-border rounded-lg p-5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-nano-text mb-3">Create Draft Batch</h3>
                    <div className="mb-3">
                      <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={batchNotes}
                        onChange={e => setBatchNotes(e.target.value)}
                        placeholder="e.g. June 2026 payout run"
                        className="w-full px-3 py-2 bg-nano-dark border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow"
                      />
                    </div>

                    {createBatchErr && (
                      <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded font-mono mb-3">
                        {createBatchErr}
                      </div>
                    )}
                    {createBatchOk && (
                      <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs p-3 rounded font-mono mb-3 flex items-center gap-2">
                        <CheckCircle size={12} /> {createBatchOk}
                      </div>
                    )}

                    <button
                      onClick={handleCreateBatch}
                      disabled={isCreatingBatch || selected.size === 0}
                      className="flex items-center gap-2 px-4 py-2.5 bg-nano-yellow/10 border border-nano-yellow/30 text-nano-yellow text-xs font-bold uppercase tracking-wider rounded hover:bg-nano-yellow/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isCreatingBatch ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                      {isCreatingBatch
                        ? 'Creating…'
                        : `Create Draft Batch${selected.size > 0 ? ` (${selected.size} affiliates, ${fmt(selectedTotal)})` : ''}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Batches tab ── */}
      {tab === 'batches' && (
        <div>
          {batchesError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded font-mono text-sm mb-4">
              {batchesError}
            </div>
          )}
          {batchActionErr && (
            <div className="bg-orange-500/10 border border-orange-500/40 text-orange-400 p-3 rounded font-mono text-xs mb-4">
              {batchActionErr}
            </div>
          )}

          {loadingBatches ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded" />)}
            </div>
          ) : (
            <div className="bg-black border border-nano-border rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-nano-border text-[10px] uppercase tracking-widest text-nano-text bg-black/40">
                    <th className="p-4 font-bold">Batch ID</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold">Total</th>
                    <th className="p-4 font-bold">Items</th>
                    <th className="p-4 font-bold">Notes</th>
                    <th className="p-4 font-bold">Created</th>
                    <th className="p-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500 italic text-sm">No payout batches yet.</td>
                    </tr>
                  ) : (
                    batches.map(b => {
                      const itemCount = Array.isArray(b.payout_items)
                        ? (b.payout_items[0]?.count ?? 0)
                        : 0;
                      const isActing = batchActionId === b.id;
                      return (
                        <tr key={b.id} className="border-b border-nano-border/50 hover:bg-white/5">
                          <td className="p-4 text-[10px] font-mono text-gray-500 truncate max-w-[100px]" title={b.id}>
                            {b.id.slice(0, 8)}…
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${BATCH_STATUS_COLORS[b.status] || ''}`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-white text-sm">{fmt(b.total_amount_cents)}</td>
                          <td className="p-4 text-sm text-white">{itemCount}</td>
                          <td className="p-4 text-xs text-nano-text truncate max-w-[120px]">{b.notes || '—'}</td>
                          <td className="p-4 text-[11px] text-nano-text font-mono">
                            {b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              {isActing && <Loader2 size={12} className="animate-spin text-nano-text" />}
                              {b.status === 'draft' && !isActing && (
                                <>
                                  <button
                                    onClick={() => handleBatchAction(b.id, 'approve')}
                                    className="px-2 py-1 text-[10px] font-bold uppercase text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30 rounded hover:bg-nano-yellow/20 transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleBatchAction(b.id, 'cancel')}
                                    className="px-2 py-1 text-[10px] font-bold uppercase text-red-400 bg-red-400/10 border border-red-400/30 rounded hover:bg-red-400/20 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {b.status === 'approved' && !isActing && (
                                <button
                                  onClick={() => handleBatchAction(b.id, 'mark_paid')}
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase text-green-400 bg-green-400/10 border border-green-400/30 rounded hover:bg-green-400/20 transition-colors"
                                >
                                  <CheckCircle size={10} /> Mark Paid
                                </button>
                              )}
                              {(b.status === 'paid' || b.status === 'cancelled') && (
                                <span className="text-[10px] text-nano-text italic">
                                  {b.status === 'paid'
                                    ? (b.paid_at ? new Date(b.paid_at).toLocaleDateString() : 'Paid')
                                    : 'Cancelled'}
                                </span>
                              )}
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
        </div>
      )}
    </div>
  );
};

export default PayoutsAdmin;
