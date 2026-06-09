import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, DollarSign, CheckCircle, X, FileText, Send } from 'lucide-react';

const BATCH_STATUS_COLORS: Record<string, string> = {
  draft: 'text-nano-text bg-white/5 border border-nano-border',
  approved: 'text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30',
  paid: 'text-green-400 bg-green-400/10 border border-green-400/30',
  cancelled: 'text-red-400 bg-red-400/10 border border-red-400/30',
};

const fmt = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

type PayoutsTab = 'payable' | 'batches';
type PaymentMethod = 'paypal' | 'ach' | 'wise' | 'stripe_manual' | 'zelle' | 'bank_transfer' | 'other';
type PayoutDisplayState =
  | 'Manual payout'
  | 'Stripe Connect onboarding required'
  | 'Stripe Connect ready'
  | 'Transferred to Stripe account'
  | 'Payout pending'
  | 'Paid'
  | 'Failed';

interface PayableRow {
  affiliate_id: string;
  code: string;
  contact_email: string;
  paypal_email: string | null;
  net_cents: number;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'paypal', label: 'PayPal' },
  { value: 'ach', label: 'ACH' },
  { value: 'wise', label: 'Wise' },
  { value: 'stripe_manual', label: 'Stripe Manual' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
];

const toDateTimeLocal = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const RETRYABLE_STRIPE_FAILURE_CODES = new Set([
  'balance_insufficient',
  'insufficient_funds',
  'api_connection_error',
  'api_error',
  'rate_limit',
  'lock_timeout',
]);

const isRetryableStripeFailure = (item: any) =>
  item.status === 'failed'
  && !item.stripe_transfer_id
  && RETRYABLE_STRIPE_FAILURE_CODES.has(item.payout_failure_code || '');

const formatPayoutFailure = (item: any) => {
  if (item.payout_failure_code === 'balance_insufficient') {
    return 'Stripe balance is not available yet. Retry after funds clear.';
  }
  return item.payout_failure_message || item.payout_failure_code || null;
};

const truncateId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 10)}...${value.slice(-4)}` : '-';

const summarizeRequirementsDue = (value: any) => {
  if (!value) return 'None';
  const requirements = Array.isArray(value)
    ? value
    : Array.isArray(value.currently_due)
      ? value.currently_due
      : Object.values(value).flat();
  const clean = requirements.filter(Boolean);
  return clean.length === 0 ? 'None' : `${clean.length} due`;
};

const getPayoutEligibilityLabel = (item: any, affiliate: any) => {
  if (affiliate?.payout_method !== 'stripe_connect') return 'Manual payout';
  if (item.stripe_transfer_id) return 'Already transferred';
  if (item.payout_failure_code === 'balance_insufficient' && isRetryableStripeFailure(item)) {
    return 'Retry after balance clears';
  }
  if (item.status === 'failed') return isRetryableStripeFailure(item) ? 'Stripe Connect ready' : 'Not retryable';
  if (!affiliate?.stripe_connect_account_id || affiliate?.stripe_connect_payouts_enabled !== true) {
    return 'Stripe setup incomplete';
  }
  if (item.status === 'transferred' || item.status === 'paid') return 'Already transferred';
  return 'Stripe Connect ready';
};

const getPayoutDisplayState = (item: any): PayoutDisplayState => {
  if (item.payout_failure_code || item.payout_failure_message || item.stripe_transfer_status === 'failed' || item.stripe_payout_status === 'failed') {
    return 'Failed';
  }
  if (item.status === 'paid') return 'Paid';
  if (item.stripe_payout_status && !['paid', 'failed', 'canceled'].includes(item.stripe_payout_status)) return 'Payout pending';
  if (item.stripe_transfer_id) return 'Transferred to Stripe account';

  const affiliate = Array.isArray(item.affiliates) ? item.affiliates[0] : item.affiliates;
  if (affiliate?.payout_method === 'stripe_connect') {
    return affiliate.stripe_connect_payouts_enabled && affiliate.stripe_connect_account_id
      ? 'Stripe Connect ready'
      : 'Stripe Connect onboarding required';
  }

  return 'Manual payout';
};

const PayoutsAdmin: React.FC = () => {
  const [tab, setTab] = useState<PayoutsTab>('payable');

  const [payableRows, setPayableRows] = useState<PayableRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPayable, setLoadingPayable] = useState(true);
  const [payableError, setPayableError] = useState<string | null>(null);

  const [batchNotes, setBatchNotes] = useState('');
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [createBatchErr, setCreateBatchErr] = useState<string | null>(null);
  const [createBatchOk, setCreateBatchOk] = useState<string | null>(null);

  const [batches, setBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [batchActionId, setBatchActionId] = useState<string | null>(null);
  const [batchActionErr, setBatchActionErr] = useState<string | null>(null);
  const [stripeProcessId, setStripeProcessId] = useState<string | null>(null);
  const [stripeProcessErr, setStripeProcessErr] = useState<string | null>(null);
  const [stripeProcessOk, setStripeProcessOk] = useState<string | null>(null);

  const [manualPaymentItem, setManualPaymentItem] = useState<any | null>(null);
  const [manualPaymentBatch, setManualPaymentBatch] = useState<any | null>(null);
  const [manualPaymentForm, setManualPaymentForm] = useState({
    payment_method: 'paypal' as PaymentMethod,
    payment_destination: '',
    payment_reference: '',
    paid_at: toDateTimeLocal(new Date()),
    notes: '',
    confirmed: false,
  });
  const [manualPaymentErr, setManualPaymentErr] = useState<string | null>(null);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

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

      const netMap = new Map<string, number>();
      for (const row of ledgerData) {
        const cur = netMap.get(row.affiliate_id) ?? 0;
        netMap.set(row.affiliate_id, cur + (row.type === 'earned' ? row.amount_cents : -row.amount_cents));
      }

      const affMap = new Map(affiliatesData.map((a: any) => [a.id, a]));
      const rows: PayableRow[] = [];
      for (const [affId, net] of netMap.entries()) {
        if (net <= 0) continue;
        const aff = affMap.get(affId);
        if (!aff || net < (aff.minimum_payout_cents ?? 5000)) continue;
        rows.push({
          affiliate_id: affId,
          code: aff.code,
          contact_email: aff.contact_email || '',
          paypal_email: aff.paypal_email || null,
          net_cents: net,
        });
      }

      rows.sort((a, b) => b.net_cents - a.net_cents);
      setPayableRows(rows);
    } catch (err: any) {
      setPayableError(err.message || 'Failed to load payable commissions');
    } finally {
      setLoadingPayable(false);
    }
  }, [refreshKey]);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    setBatchesError(null);
    try {
      const { data, error: err } = await supabase
        .from('payout_batches')
        .select(`
          id,
          status,
          total_amount_cents,
          notes,
          created_at,
          approved_at,
          paid_at,
          payout_items(
            id,
            affiliate_id,
            amount_cents,
            status,
            paypal_email,
            payment_provider,
            payment_method,
            payment_destination,
            payment_reference,
            paid_by,
            paid_at,
            paid_notes,
            stripe_transfer_id,
            stripe_transfer_status,
            stripe_destination_account_id,
            stripe_transfer_created_at,
            stripe_payout_id,
            stripe_payout_status,
            stripe_payout_arrival_date,
            payout_failure_code,
            payout_failure_message,
            affiliates(
              code,
              contact_email,
              payout_method,
              stripe_connect_account_id,
              stripe_connect_onboarding_status,
              stripe_connect_payouts_enabled,
              stripe_connect_charges_enabled,
              stripe_connect_requirements_due
            )
          )
        `)
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

  const handleCreateBatch = async () => {
    const selectedIds = [...selected];
    if (selectedIds.length === 0) {
      setCreateBatchErr('Select at least one affiliate.');
      return;
    }

    setIsCreatingBatch(true);
    setCreateBatchErr(null);
    setCreateBatchOk(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_create_affiliate_payout_batch', {
        p_affiliate_ids: selectedIds,
        p_notes: batchNotes.trim() || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('Batch creation returned no result. Please retry.');
      }

      const result = Array.isArray(data) ? data[0] : data;
      setCreateBatchOk(`Draft batch created: ${result.affiliate_count} affiliate(s), ${fmt(result.total_amount_cents)} total.`);
      setBatchNotes('');
      setRefreshKey(k => k + 1);
      setTimeout(() => {
        setCreateBatchOk(null);
        setTab('batches');
      }, 2500);
    } catch (err: any) {
      setCreateBatchErr(err.message);
    } finally {
      setIsCreatingBatch(false);
    }
  };

  const handleBatchAction = async (batchId: string, action: 'approve' | 'cancel') => {
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
      } else if (action === 'cancel') {
        if (!confirm('Cancel this batch? Commission ledger rows will be released back to payable.')) {
          setBatchActionId(null);
          return;
        }
        updates.status = 'cancelled';
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

  const handleSendStripeConnectPayouts = async (batchId: string, payoutItemIds?: string[]) => {
    const actionId = payoutItemIds?.length === 1 ? payoutItemIds[0] : batchId;
    setStripeProcessId(actionId);
    setStripeProcessErr(null);
    setStripeProcessOk(null);

    try {
      const { data, error: processErr } = await supabase.functions.invoke('process-affiliate-payout-batch', {
        body: {
          payout_batch_id: batchId,
          payout_item_ids: payoutItemIds,
        },
      });

      if (processErr) throw new Error(processErr.message);

      const results = data?.results || [];
      const sent = results.filter((row: any) => row.status === 'sent').length;
      const failed = results.filter((row: any) => row.status === 'failed').length;
      const skipped = results.length - sent - failed;
      setStripeProcessOk(`Stripe Connect processing complete: ${sent} sent, ${failed} failed, ${skipped} skipped.`);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setStripeProcessErr(err.message || 'Failed to send Stripe Connect payout.');
    } finally {
      setStripeProcessId(null);
    }
  };

  const openManualPaymentModal = (batch: any, item: any) => {
    setManualPaymentBatch(batch);
    setManualPaymentItem(item);
    setManualPaymentErr(null);
    setManualPaymentForm({
      payment_method: item.paypal_email ? 'paypal' : 'other',
      payment_destination: item.paypal_email || '',
      payment_reference: '',
      paid_at: toDateTimeLocal(new Date()),
      notes: '',
      confirmed: false,
    });
  };

  const closeManualPaymentModal = () => {
    setManualPaymentItem(null);
    setManualPaymentBatch(null);
    setManualPaymentErr(null);
  };

  const handleRecordManualPayment = async () => {
    if (!manualPaymentItem || !manualPaymentBatch) return;

    const paymentDestination = manualPaymentForm.payment_destination.trim();
    const paymentReference = manualPaymentForm.payment_reference.trim();

    if (manualPaymentBatch.status !== 'approved') {
      setManualPaymentErr('Payout batch must be approved before recording payment.');
      return;
    }
    if (!manualPaymentItem.amount_cents || manualPaymentItem.amount_cents <= 0) {
      setManualPaymentErr('Payout amount must be greater than zero.');
      return;
    }
    if (!paymentDestination) {
      setManualPaymentErr('Payment destination is required.');
      return;
    }
    if (!paymentReference) {
      setManualPaymentErr('Payment reference is required.');
      return;
    }
    if (!manualPaymentForm.confirmed) {
      setManualPaymentErr('Confirm that funds have already been sent outside Cast Director Studio.');
      return;
    }

    setIsRecordingPayment(true);
    setManualPaymentErr(null);

    try {
      const paidAt = new Date(manualPaymentForm.paid_at);
      if (Number.isNaN(paidAt.getTime())) {
        throw new Error('Paid at must be a valid date and time.');
      }

      const { error: rpcErr } = await supabase.rpc('admin_record_affiliate_manual_payout', {
        p_payout_item_id: manualPaymentItem.id,
        p_payment_method: manualPaymentForm.payment_method,
        p_payment_destination: paymentDestination,
        p_payment_reference: paymentReference,
        p_paid_at: paidAt.toISOString(),
        p_notes: manualPaymentForm.notes.trim() || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      closeManualPaymentModal();
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setManualPaymentErr(err.message || 'Failed to record manual payment.');
    } finally {
      setIsRecordingPayment(false);
    }
  };

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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold font-mono tracking-wide">Payout Management</h2>
        <p className="text-sm text-nano-text mt-1">
          Review payable commissions, create draft batches, and record manual payouts.
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-nano-border">
        {(['payable', 'batches'] as PayoutsTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors rounded-t -mb-px ${
              tab === t
                ? 'bg-nano-panel border border-b-nano-panel border-nano-border text-nano-yellow'
                : 'text-nano-text hover:text-white'
            }`}
          >
            {t === 'payable' ? 'Payable' : 'Batch History'}
          </button>
        ))}
      </div>

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
          ) : payableRows.length === 0 ? (
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
                          <div className="text-[10px] text-nano-text mt-0.5">{row.contact_email || '-'}</div>
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
                        {selected.size > 0 ? fmt(selectedTotal) : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

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
                    ? 'Creating...'
                    : `Create Draft Batch${selected.size > 0 ? ` (${selected.size} affiliates, ${fmt(selectedTotal)})` : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
          {stripeProcessErr && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded font-mono text-sm mb-4">
              {stripeProcessErr}
            </div>
          )}
          {stripeProcessOk && (
            <div className="bg-green-500/10 border border-green-500/40 text-green-400 p-4 rounded font-mono text-sm mb-4">
              {stripeProcessOk}
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
                    batches.map(batch => {
                      const payoutItems = Array.isArray(batch.payout_items) ? batch.payout_items : [];
                      const isActing = batchActionId === batch.id;
                      const eligibleStripeItems = payoutItems.filter((item: any) => {
                        const affiliate = Array.isArray(item.affiliates) ? item.affiliates[0] : item.affiliates;
                        return batch.status === 'approved'
                          && item.status === 'pending'
                          && !item.stripe_transfer_id
                          && affiliate?.payout_method === 'stripe_connect'
                          && affiliate?.stripe_connect_account_id
                          && affiliate?.stripe_connect_payouts_enabled
                          && item.amount_cents > 0;
                      });
                      const retryableFailedStripeItems = payoutItems.filter((item: any) => {
                        const affiliate = Array.isArray(item.affiliates) ? item.affiliates[0] : item.affiliates;
                        return batch.status === 'approved'
                          && isRetryableStripeFailure(item)
                          && affiliate?.payout_method === 'stripe_connect'
                          && affiliate?.stripe_connect_account_id
                          && affiliate?.stripe_connect_payouts_enabled
                          && item.amount_cents > 0;
                      });
                      const isStripeBatchProcessing = stripeProcessId === batch.id;
                      const hasRetryableFailures = retryableFailedStripeItems.length > 0;
                      return (
                        <React.Fragment key={batch.id}>
                          <tr className="border-b border-nano-border/50 hover:bg-white/5">
                            <td className="p-4 text-[10px] font-mono text-gray-500 truncate max-w-[100px]" title={batch.id}>
                              {batch.id.slice(0, 8)}...
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${BATCH_STATUS_COLORS[batch.status] || ''}`}>
                                {batch.status}
                              </span>
                            </td>
                            <td className="p-4 font-mono text-white text-sm">{fmt(batch.total_amount_cents)}</td>
                            <td className="p-4 text-sm text-white">{payoutItems.length}</td>
                            <td className="p-4 text-xs text-nano-text truncate max-w-[120px]">{batch.notes || '-'}</td>
                            <td className="p-4 text-[11px] text-nano-text font-mono">
                              {batch.created_at ? new Date(batch.created_at).toLocaleDateString() : '-'}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center gap-2 justify-end">
                                {isActing && <Loader2 size={12} className="animate-spin text-nano-text" />}
                                {batch.status === 'draft' && !isActing && (
                                  <>
                                    <button
                                      onClick={() => handleBatchAction(batch.id, 'approve')}
                                      className="px-2 py-1 text-[10px] font-bold uppercase text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30 rounded hover:bg-nano-yellow/20 transition-colors"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleBatchAction(batch.id, 'cancel')}
                                      className="px-2 py-1 text-[10px] font-bold uppercase text-red-400 bg-red-400/10 border border-red-400/30 rounded hover:bg-red-400/20 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                {batch.status === 'approved' && (eligibleStripeItems.length > 0 || hasRetryableFailures) && (
                                  <button
                                    onClick={() => handleSendStripeConnectPayouts(batch.id)}
                                    disabled={Boolean(stripeProcessId)}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30 rounded hover:bg-nano-yellow/20 transition-colors disabled:opacity-40"
                                  >
                                    {isStripeBatchProcessing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                    {hasRetryableFailures ? 'Retry eligible Stripe Connect payouts' : 'Send eligible Stripe Connect payouts'}
                                  </button>
                                )}
                                {(batch.status === 'paid' || batch.status === 'cancelled') && (
                                  <span className="text-[10px] text-nano-text italic">
                                    {batch.status === 'paid'
                                      ? (batch.paid_at ? new Date(batch.paid_at).toLocaleDateString() : 'Paid')
                                      : 'Cancelled'}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                          <tr className="border-b border-nano-border bg-white/[0.02]">
                            <td colSpan={7} className="p-0">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="text-[10px] uppercase tracking-widest text-gray-500">
                                      <th className="px-4 py-2 font-bold">Affiliate</th>
                                      <th className="px-4 py-2 font-bold text-right">Amount</th>
                                      <th className="px-4 py-2 font-bold">Payout State</th>
                                      <th className="px-4 py-2 font-bold">Destination</th>
                                      <th className="px-4 py-2 font-bold">Provider / Method</th>
                                      <th className="px-4 py-2 font-bold">Reference</th>
                                      <th className="px-4 py-2 font-bold">Paid At</th>
                                      <th className="px-4 py-2 font-bold">Paid By</th>
                                      <th className="px-4 py-2 font-bold text-right">Item Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {payoutItems.map((item: any) => {
                                      const affiliate = Array.isArray(item.affiliates) ? item.affiliates[0] : item.affiliates;
                                      const isStripeConnect = affiliate?.payout_method === 'stripe_connect';
                                      const isStripeConnectReady = isStripeConnect && affiliate?.stripe_connect_account_id && affiliate?.stripe_connect_payouts_enabled;
                                      const canRecordPayment = !isStripeConnect && batch.status === 'approved' && item.status === 'pending' && item.amount_cents > 0;
                                      const canSendStripeConnect = isStripeConnectReady
                                        && batch.status === 'approved'
                                        && item.status === 'pending'
                                        && !item.stripe_transfer_id
                                        && item.amount_cents > 0;
                                      const canRetryStripeConnect = isStripeConnectReady
                                        && batch.status === 'approved'
                                        && isRetryableStripeFailure(item)
                                        && item.amount_cents > 0;
                                      const isStripeItemProcessing = stripeProcessId === item.id;
                                      const payoutState = getPayoutDisplayState(item);
                                      const payoutFailure = formatPayoutFailure(item);
                                      const eligibilityLabel = getPayoutEligibilityLabel(item, affiliate);
                                      return (
                                        <React.Fragment key={item.id}>
                                          <tr className="border-t border-nano-border/40">
                                            <td className="px-4 py-3">
                                              <div className="font-mono text-xs text-nano-yellow">{affiliate?.code || item.affiliate_id?.slice(0, 8) || '-'}</div>
                                              <div className="text-[10px] text-nano-text">{affiliate?.contact_email || '-'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs text-white">{fmt(item.amount_cents)}</td>
                                            <td className="px-4 py-3 text-xs text-nano-text">
                                              <div className={payoutState === 'Failed' ? 'text-red-400' : payoutState === 'Paid' ? 'text-green-400' : 'text-nano-text'}>
                                                {payoutState}
                                              </div>
                                              <div className="mt-1 text-[10px] text-nano-yellow">{eligibilityLabel}</div>
                                              {payoutState === 'Stripe Connect onboarding required' && (
                                                <div className="mt-1 text-[10px] text-orange-300">
                                                  {affiliate?.stripe_connect_onboarding_status || 'not_started'}
                                                </div>
                                              )}
                                              {payoutFailure && (
                                                <div className="mt-1 max-w-[180px] truncate text-[10px] text-red-400" title={payoutFailure}>
                                                  {payoutFailure}
                                                </div>
                                              )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-nano-text font-mono">
                                              {item.payment_destination || item.stripe_destination_account_id || item.paypal_email || <span className="text-red-400 italic">Missing</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-nano-text">
                                              <div>{item.payment_provider || (affiliate?.payout_method === 'stripe_connect' ? 'stripe_connect' : 'manual')}</div>
                                              <div className="text-[10px] text-gray-500">{item.payment_method || '-'}</div>
                                              {item.stripe_transfer_status && (
                                                <div className="text-[10px] text-nano-yellow">Transfer: {item.stripe_transfer_status}</div>
                                              )}
                                              {item.stripe_payout_status && (
                                                <div className="text-[10px] text-green-400">Bank payout status: {item.stripe_payout_status}</div>
                                              )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-white font-mono max-w-[160px] truncate" title={item.payment_reference || item.stripe_transfer_id || item.stripe_payout_id || ''}>
                                              {item.payment_reference || item.stripe_payout_id || item.stripe_transfer_id || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-[11px] text-nano-text font-mono">
                                              {item.paid_at ? new Date(item.paid_at).toLocaleString() : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-[10px] text-nano-text font-mono max-w-[100px] truncate" title={item.paid_by || ''}>
                                              {item.paid_by ? item.paid_by.slice(0, 8) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              {canRecordPayment ? (
                                                <button
                                                  onClick={() => openManualPaymentModal(batch, item)}
                                                  className="px-2 py-1 text-[10px] font-bold uppercase text-green-400 bg-green-400/10 border border-green-400/30 rounded hover:bg-green-400/20 transition-colors"
                                                >
                                                  Record Manual Payment
                                                </button>
                                              ) : canSendStripeConnect ? (
                                                <button
                                                  onClick={() => handleSendStripeConnectPayouts(batch.id, [item.id])}
                                                  disabled={Boolean(stripeProcessId)}
                                                  className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30 rounded hover:bg-nano-yellow/20 transition-colors disabled:opacity-40"
                                                >
                                                  {isStripeItemProcessing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                  Send via Stripe Connect
                                                </button>
                                              ) : canRetryStripeConnect ? (
                                                <button
                                                  onClick={() => handleSendStripeConnectPayouts(batch.id, [item.id])}
                                                  disabled={Boolean(stripeProcessId)}
                                                  className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30 rounded hover:bg-nano-yellow/20 transition-colors disabled:opacity-40"
                                                >
                                                  {isStripeItemProcessing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                  Retry Stripe Connect Payout
                                                </button>
                                              ) : item.stripe_transfer_id ? (
                                                <span className="text-[10px] text-nano-yellow font-mono">
                                                  Transferred to Stripe account
                                                </span>
                                              ) : item.status === 'pending' && isStripeConnect ? (
                                                <span className="text-[10px] text-orange-300 font-mono">Stripe setup incomplete</span>
                                              ) : item.status === 'failed' && isStripeConnect ? (
                                                <span className="text-[10px] text-red-400 font-mono">Failed</span>
                                              ) : item.status === 'paid' ? (
                                                <span className="text-[10px] text-green-400 font-mono">{item.payment_reference || 'Paid'}</span>
                                              ) : (
                                                <span className="text-[10px] text-nano-text italic">{item.status}</span>
                                              )}
                                            </td>
                                          </tr>
                                          <tr className="border-t border-nano-border/20 bg-black/20">
                                            <td colSpan={9} className="px-4 pb-3">
                                              <div className="rounded border border-nano-border bg-black/30 p-3">
                                                <div className="mb-2 text-[10px] uppercase tracking-widest text-nano-text">Payout Diagnostics</div>
                                                <div className="grid grid-cols-2 gap-2 text-[10px] md:grid-cols-4 xl:grid-cols-6">
                                                  {[
                                                    ['Batch status', batch.status],
                                                    ['Item status', item.status],
                                                    ['Payout method', affiliate?.payout_method || 'manual'],
                                                    ['Connect account', truncateId(affiliate?.stripe_connect_account_id)],
                                                    ['Payouts enabled', affiliate?.stripe_connect_payouts_enabled ? 'yes' : 'no'],
                                                    ['Charges enabled', affiliate?.stripe_connect_charges_enabled ? 'yes' : 'no'],
                                                    ['Requirements due', summarizeRequirementsDue(affiliate?.stripe_connect_requirements_due)],
                                                    ['Amount cents', item.amount_cents ?? 0],
                                                    ['Transfer ID', truncateId(item.stripe_transfer_id)],
                                                    ['Transfer status', item.stripe_transfer_status || '-'],
                                                    ['Failure code', item.payout_failure_code || '-'],
                                                    ['Failure message', formatPayoutFailure(item) || '-'],
                                                  ].map(([label, value]) => (
                                                    <div key={label as string} className="min-w-0 rounded bg-white/[0.03] p-2">
                                                      <div className="text-gray-500">{label as string}</div>
                                                      <div className="mt-1 truncate font-mono text-nano-text" title={String(value)}>{String(value)}</div>
                                                    </div>
                                                  ))}
                                                </div>
                                                <p className="mt-3 text-[10px] text-orange-300">
                                                  Stripe Connect transfers require available platform balance. Pending/incoming Stripe funds cannot be transferred until they become available.
                                                </p>
                                              </div>
                                            </td>
                                          </tr>
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {manualPaymentItem && manualPaymentBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-lg border border-nano-border bg-nano-panel p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">Record Manual Payment</h3>
                <p className="mt-1 text-xs text-orange-300">
                  This does not send funds. Only record payment after funds were sent outside Cast Director Studio.
                </p>
              </div>
              <button
                onClick={closeManualPaymentModal}
                disabled={isRecordingPayment}
                className="rounded p-1 text-nano-text hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 rounded border border-nano-border bg-black/30 p-3 text-xs">
              <div>
                <div className="text-gray-500 uppercase tracking-wider">Amount</div>
                <div className="font-mono text-white">{fmt(manualPaymentItem.amount_cents)}</div>
              </div>
              <div>
                <div className="text-gray-500 uppercase tracking-wider">Batch</div>
                <div className="font-mono text-white">{manualPaymentBatch.id.slice(0, 8)}...</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Payment Method</label>
                <select
                  value={manualPaymentForm.payment_method}
                  onChange={e => setManualPaymentForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}
                  className="w-full px-3 py-2 bg-nano-dark border border-nano-border rounded text-sm text-white focus:outline-none focus:border-nano-yellow"
                >
                  {PAYMENT_METHODS.map(method => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Payment Destination</label>
                <input
                  type="text"
                  value={manualPaymentForm.payment_destination}
                  onChange={e => setManualPaymentForm(f => ({ ...f, payment_destination: e.target.value }))}
                  className="w-full px-3 py-2 bg-nano-dark border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow"
                  placeholder="Affiliate payment email, bank destination, or recipient handle"
                />
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Payment Reference</label>
                <input
                  type="text"
                  value={manualPaymentForm.payment_reference}
                  onChange={e => setManualPaymentForm(f => ({ ...f, payment_reference: e.target.value }))}
                  className="w-full px-3 py-2 bg-nano-dark border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow"
                  placeholder="PayPal transaction ID, bank confirmation, Wise transfer ID"
                />
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Paid At</label>
                <input
                  type="datetime-local"
                  value={manualPaymentForm.paid_at}
                  onChange={e => setManualPaymentForm(f => ({ ...f, paid_at: e.target.value }))}
                  className="w-full px-3 py-2 bg-nano-dark border border-nano-border rounded text-sm text-white focus:outline-none focus:border-nano-yellow"
                />
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes (optional)</label>
                <textarea
                  value={manualPaymentForm.notes}
                  onChange={e => setManualPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 bg-nano-dark border border-nano-border rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-nano-yellow"
                  placeholder="Internal payout note"
                />
              </div>

              <label className="flex items-start gap-3 rounded border border-nano-border bg-black/30 p-3 text-xs text-nano-text">
                <input
                  type="checkbox"
                  checked={manualPaymentForm.confirmed}
                  onChange={e => setManualPaymentForm(f => ({ ...f, confirmed: e.target.checked }))}
                  className="mt-0.5 accent-yellow-400"
                />
                <span>I confirm the funds have already been sent outside Cast Director Studio.</span>
              </label>
            </div>

            {manualPaymentErr && (
              <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs font-mono text-red-400">
                {manualPaymentErr}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeManualPaymentModal}
                disabled={isRecordingPayment}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-nano-text border border-nano-border rounded hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordManualPayment}
                disabled={isRecordingPayment}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-green-400 bg-green-400/10 border border-green-400/30 rounded hover:bg-green-400/20 disabled:opacity-50"
              >
                {isRecordingPayment ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Record Manual Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayoutsAdmin;
