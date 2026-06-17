import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, DollarSign, CheckCircle, X, FileText, Send, ChevronDown } from 'lucide-react';

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

interface PayableGroupRow {
  id: string;
  type: string;
  amount_cents: number;
  currency: string | null;
  hold_until: string | null;
  created_at: string | null;
}

interface PayableGroup {
  affiliate_id: string;
  code: string;
  contact_email: string;
  paypal_email: string | null;
  payout_method: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_payouts_enabled: boolean | null;
  stripe_connect_onboarding_status: string | null;
  minimum_payout_cents: number | null;
  net_cents: number;
  rows: PayableGroupRow[];
  reversal_count: number;
}

const PAYABLE_FILTERS = [
  { value: 'all', label: 'All eligible' },
  { value: 'stripe_connect_ready', label: 'Stripe Connect ready' },
  { value: 'manual', label: 'Manual payout' },
  { value: 'selected', label: 'Selected' },
] as const;

type PayableFilter = (typeof PAYABLE_FILTERS)[number]['value'];

const payoutMethodLabel = (group: PayableGroup) =>
  group.payout_method === 'stripe_connect' ? 'Stripe Connect' : 'Manual';

const payoutReadinessLabel = (group: PayableGroup) => {
  if (group.payout_method === 'stripe_connect') {
    return group.stripe_connect_account_id && group.stripe_connect_payouts_enabled
      ? 'Stripe Connect ready'
      : 'Setup incomplete';
  }
  return 'Manual payout';
};

const eligibilityLabelForPayable = (group: PayableGroup) => {
  if (group.payout_method === 'stripe_connect') {
    if (group.stripe_connect_account_id && group.stripe_connect_payouts_enabled) {
      return 'Stripe Connect ready';
    }
    return 'Stripe setup incomplete';
  }
  return 'Manual payout';
};

const getPayableRowTypeLabel = (row: PayableGroupRow) => {
  if (row.type === 'earned') return 'Earned';
  if (row.type === 'reversal') return 'Reversal';
  return row.type || 'Commission';
};

const matchesPayableSearch = (group: PayableGroup, query: string) => {
  const tokens = [
    group.code,
    group.contact_email,
    group.payout_method,
    payoutReadinessLabel(group),
    String(group.net_cents),
    fmt(group.net_cents),
    eligibilityLabelForPayable(group),
    String(group.reversal_count),
  ];

  for (const row of group.rows) {
    tokens.push(
      row.type,
      getPayableRowTypeLabel(row),
      String(row.amount_cents),
      fmt(row.amount_cents),
      row.hold_until,
      row.created_at,
    );
  }

  const haystack = tokens.filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
};

const payableMatchesFilter = (group: PayableGroup, filter: PayableFilter, selected: Set<string>) => {
  if (filter === 'all') return true;
  if (filter === 'selected') return selected.has(group.affiliate_id);
  if (filter === 'stripe_connect_ready') return group.payout_method === 'stripe_connect' && group.stripe_connect_account_id && group.stripe_connect_payouts_enabled;
  if (filter === 'manual') return group.payout_method !== 'stripe_connect';
  return true;
};

const summaryForSelected = (groups: PayableGroup[], selected: Set<string>) => {
  const selectedGroups = groups.filter(group => selected.has(group.affiliate_id));
  const stripeConnect = selectedGroups.filter(group => group.payout_method === 'stripe_connect').length;
  const manual = selectedGroups.filter(group => group.payout_method !== 'stripe_connect').length;
  return { count: selectedGroups.length, stripeConnect, manual };
};

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

const BATCH_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'retryable', label: 'Retryable' },
  { value: 'approved', label: 'Approved' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'paid', label: 'Paid' },
  { value: 'manual', label: 'Manual' },
  { value: 'stripe_connect', label: 'Stripe Connect' },
] as const;

type BatchFilter = (typeof BATCH_FILTERS)[number]['value'];

const getAffiliateFromItem = (item: any) =>
  Array.isArray(item.affiliates) ? item.affiliates[0] : item.affiliates;

const isStripeConnectReadyForItem = (item: any) => {
  const affiliate = getAffiliateFromItem(item);
  return affiliate?.payout_method === 'stripe_connect'
    && affiliate?.stripe_connect_account_id
    && affiliate?.stripe_connect_payouts_enabled;
};

const getBatchAffiliateSummary = (batch: any) => {
  const payoutItems = Array.isArray(batch.payout_items) ? batch.payout_items : [];
  const affiliates = payoutItems
    .map(getAffiliateFromItem)
    .filter(Boolean);

  if (affiliates.length === 0) {
    return { count: 0, label: 'No affiliates', sub: '-' };
  }

  const first = affiliates[0];
  if (affiliates.length === 1) {
    return {
      count: 1,
      label: first.code || 'Unknown affiliate',
      sub: first.contact_email || '-',
    };
  }

  return {
    count: affiliates.length,
    label: `${affiliates.length} affiliates`,
    sub: `${first.code || 'Unknown'} • ${first.contact_email || '-'}`,
  };
};

const getBatchStatusSummary = (batch: any) => {
  const payoutItems = Array.isArray(batch.payout_items) ? batch.payout_items : [];
  const retryableItem = payoutItems.find((item: any) =>
    isRetryableStripeFailure(item)
    && !item.stripe_transfer_id
    && isStripeConnectReadyForItem(item)
  );
  if (retryableItem) {
    return 'Balance unavailable — retry after funds clear';
  }

  const transferredItem = payoutItems.find((item: any) =>
    item.stripe_transfer_id || item.stripe_payout_id
  );
  if (transferredItem) {
    return `Transferred: ${truncateId(transferredItem.stripe_transfer_id || transferredItem.stripe_payout_id)}`;
  }

  if (batch.status === 'paid') {
    return 'Paid';
  }

  const stripeItem = payoutItems.find((item: any) => getAffiliateFromItem(item)?.payout_method === 'stripe_connect');
  if (stripeItem) {
    return isStripeConnectReadyForItem(stripeItem) ? 'Stripe Connect ready' : 'Setup incomplete';
  }

  return 'Manual payout';
};

const matchesBatchSearch = (batch: any, query: string) => {
  const payoutItems = Array.isArray(batch.payout_items) ? batch.payout_items : [];
  const tokens = [
    batch.id,
    batch.status,
    String(batch.total_amount_cents),
    fmt(batch.total_amount_cents),
    batch.notes,
  ];

  for (const item of payoutItems) {
    const affiliate = getAffiliateFromItem(item);
    tokens.push(
      item.status,
      String(item.amount_cents),
      fmt(item.amount_cents),
      item.payment_reference,
      item.stripe_transfer_id,
      item.stripe_transfer_status,
      item.payout_failure_code,
      item.payout_failure_message,
      affiliate?.code,
      affiliate?.contact_email,
    );
  }

  const haystack = tokens.filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
};

const batchMatchesFilter = (batch: any, filter: BatchFilter) => {
  if (filter === 'all') return true;
  const payoutItems = Array.isArray(batch.payout_items) ? batch.payout_items : [];

  const hasFailed = payoutItems.some((item: any) =>
    item.status === 'failed'
    || item.payout_failure_code
    || item.payout_failure_message
    || item.stripe_transfer_status === 'failed'
    || item.stripe_payout_status === 'failed'
  );

  const hasRetryable = payoutItems.some((item: any) =>
    isRetryableStripeFailure(item)
    && !item.stripe_transfer_id
    && isStripeConnectReadyForItem(item)
  );

  const hasTransferred = payoutItems.some((item: any) =>
    Boolean(item.stripe_transfer_id || item.stripe_payout_id)
  );

  const hasPaid = batch.status === 'paid' || payoutItems.some((item: any) => item.status === 'paid');

  const hasManual = payoutItems.some((item: any) => {
    const affiliate = getAffiliateFromItem(item);
    return affiliate?.payout_method !== 'stripe_connect';
  });

  const hasStripeConnect = payoutItems.some((item: any) => {
    const affiliate = getAffiliateFromItem(item);
    return affiliate?.payout_method === 'stripe_connect';
  });

  if (filter === 'failed') return hasFailed;
  if (filter === 'retryable') return hasRetryable;
  if (filter === 'approved') return batch.status === 'approved';
  if (filter === 'transferred') return hasTransferred;
  if (filter === 'paid') return hasPaid;
  if (filter === 'manual') return hasManual;
  if (filter === 'stripe_connect') return hasStripeConnect;
  return true;
};

const PayoutsAdmin: React.FC = () => {
  const [tab, setTab] = useState<PayoutsTab>('payable');

  const [payableGroups, setPayableGroups] = useState<PayableGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPayable, setLoadingPayable] = useState(true);
  const [payableError, setPayableError] = useState<string | null>(null);
  const [payableSearchQuery, setPayableSearchQuery] = useState('');
  const [activePayableFilter, setActivePayableFilter] = useState<PayableFilter>('all');
  const [expandedPayableGroups, setExpandedPayableGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('cds_admin_payable_group_expanded');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const filteredPayableGroups = payableGroups.filter(group => {
    const query = payableSearchQuery.trim().toLowerCase();
    if (!payableMatchesFilter(group, activePayableFilter, selected)) return false;
    if (!query) return true;
    return matchesPayableSearch(group, query);
  });

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
          .select('id, affiliate_id, type, amount_cents, currency, hold_until, created_at')
          .is('payout_batch_id', null)
          .lte('hold_until', now),
        supabase
          .from('affiliates')
          .select(
            'id, code, contact_email, paypal_email, minimum_payout_cents, payout_method, stripe_connect_account_id, stripe_connect_payouts_enabled, stripe_connect_onboarding_status'
          )
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

      const groups = new Map<string, PayableGroup>();
      for (const row of ledgerData) {
        const affiliateId = row.affiliate_id;
        if (!affiliateId) continue;
        const group = groups.get(affiliateId) || {
          affiliate_id: affiliateId,
          code: '',
          contact_email: '',
          paypal_email: null,
          payout_method: null,
          stripe_connect_account_id: null,
          stripe_connect_payouts_enabled: null,
          stripe_connect_onboarding_status: null,
          minimum_payout_cents: null,
          net_cents: 0,
          rows: [],
          reversal_count: 0,
        };

        group.net_cents += row.type === 'earned' ? row.amount_cents : -row.amount_cents;
        group.rows.push({
          id: row.id,
          type: row.type,
          amount_cents: row.amount_cents,
          currency: row.currency || null,
          hold_until: row.hold_until || null,
          created_at: row.created_at || null,
        });
        if (row.type === 'reversal') group.reversal_count += 1;
        groups.set(affiliateId, group);
      }

      const affMap = new Map(affiliatesData.map((a: any) => [a.id, a]));
      const finalGroups: PayableGroup[] = [];
      for (const group of groups.values()) {
        const aff = affMap.get(group.affiliate_id);
        if (!aff) continue;
        const minimum = aff.minimum_payout_cents ?? 0;
        if (group.net_cents <= 0 || group.net_cents < minimum) continue;

        finalGroups.push({
          ...group,
          code: aff.code,
          contact_email: aff.contact_email || '',
          paypal_email: aff.paypal_email || null,
          payout_method: aff.payout_method || null,
          stripe_connect_account_id: aff.stripe_connect_account_id || null,
          stripe_connect_payouts_enabled: aff.stripe_connect_payouts_enabled ?? null,
          stripe_connect_onboarding_status: aff.stripe_connect_onboarding_status || null,
          minimum_payout_cents: aff.minimum_payout_cents ?? null,
        });
      }

      finalGroups.sort((a, b) => b.net_cents - a.net_cents);
      setPayableGroups(finalGroups);
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

  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('cds_admin_payout_batch_expanded');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<BatchFilter>('all');

  const filteredBatches = batches.filter(batch => {
    const searchText = searchQuery.trim().toLowerCase();
    if (activeFilter !== 'all' && !batchMatchesFilter(batch, activeFilter)) return false;
    if (!searchText) return true;
    return matchesBatchSearch(batch, searchText);
  });

  useEffect(() => {
    try {
      localStorage.setItem('cds_admin_payout_batch_expanded', JSON.stringify(Array.from(expandedBatches)));
    } catch {
      // ignore storage failure
    }
  }, [expandedBatches]);

  useEffect(() => {
    try {
      localStorage.setItem('cds_admin_payable_group_expanded', JSON.stringify(Array.from(expandedPayableGroups)));
    } catch {
      // ignore storage failure
    }
  }, [expandedPayableGroups]);

  useEffect(() => { loadPayable(); }, [loadPayable]);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  const toggleBatchExpansion = (batchId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const toggleGroupExpansion = (affiliateId: string) => {
    setExpandedPayableGroups(prev => {
      const next = new Set(prev);
      if (next.has(affiliateId)) next.delete(affiliateId);
      else next.add(affiliateId);
      return next;
    });
  };

  const toggleDiagnostics = (itemId: string) => {
    setExpandedDiagnostics(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === payableGroups.length) setSelected(new Set());
    else setSelected(new Set(payableGroups.map(r => r.affiliate_id)));
  };

  const selectedTotal = payableGroups
    .filter(r => selected.has(r.affiliate_id))
    .reduce((s, r) => s + r.net_cents, 0);

  const selectedSummary = summaryForSelected(payableGroups, selected);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold font-mono tracking-wide">Payout Management</h2>
        <p className="text-sm text-nano-text mt-1">
          Review payable affiliate commissions, create payout batches, and send approved payouts manually or through Stripe Connect.
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
          ) : payableGroups.length === 0 ? (
            <div className="bg-black border border-nano-border rounded-lg p-12 text-center">
              <DollarSign size={32} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 italic text-sm">No affiliates with payable commissions.</p>
              <p className="text-[10px] text-nano-text mt-1">
                Payable commissions have passed the hold period, meet the affiliate's minimum payout, and are not already batched.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
                  <div>
                    <label htmlFor="payable-search" className="sr-only">Search payable commissions</label>
                    <input
                      id="payable-search"
                      type="search"
                      value={payableSearchQuery}
                      onChange={e => setPayableSearchQuery(e.target.value)}
                      placeholder="Search payable commissions by affiliate, email, amount, payout method, or status..."
                      className="w-full rounded border border-nano-border bg-nano-dark px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-nano-yellow focus:outline-none"
                    />
                  </div>
                  {(payableSearchQuery || activePayableFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setPayableSearchQuery('');
                        setActivePayableFilter('all');
                      }}
                      className="inline-flex items-center justify-center rounded border border-nano-border bg-black/50 px-3 py-2 text-xs uppercase tracking-widest text-nano-text hover:bg-white/5"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {PAYABLE_FILTERS.map(filter => (
                    <button
                      key={filter.value}
                      onClick={() => setActivePayableFilter(filter.value)}
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                        activePayableFilter === filter.value
                          ? 'border-nano-yellow bg-nano-yellow/10 text-nano-yellow'
                          : 'border-nano-border bg-black/40 text-nano-text hover:bg-white/5'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-nano-text">
                  Payable = past hold period, meets minimum, and not yet batched.
                </p>
              </div>

              {filteredPayableGroups.length === 0 ? (
                <div className="bg-black border border-nano-border rounded-lg p-12 text-center">
                  <DollarSign size={32} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 italic text-sm">No payable commissions match your search.</p>
                  <p className="text-[10px] text-nano-text mt-1">Try a different query or clear your filters.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPayableGroups.map(group => {
                    const isExpanded = expandedPayableGroups.has(group.affiliate_id);
                    return (
                      <div key={group.affiliate_id} className="rounded-2xl border border-nano-border bg-black/40">
                        <div className="grid grid-cols-12 gap-3 p-4 items-center">
                          <div className="col-span-1 flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selected.has(group.affiliate_id)}
                              onChange={() => toggleSelect(group.affiliate_id)}
                              className="accent-yellow-400"
                            />
                          </div>
                          <div className="col-span-11 sm:col-span-4">
                            <div className="text-[10px] uppercase tracking-widest text-nano-text">Affiliate</div>
                            <div className="mt-1 font-mono text-sm text-nano-yellow truncate">{group.code}</div>
                            <div className="text-[10px] text-nano-text truncate">{group.contact_email || '-'}</div>
                          </div>
                          <div className="col-span-6 sm:col-span-2">
                            <div className="text-[10px] uppercase tracking-widest text-nano-text">Net payable</div>
                            <div className="mt-1 font-mono text-sm text-white">{fmt(group.net_cents)}</div>
                          </div>
                          <div className="col-span-6 sm:col-span-2">
                            <div className="text-[10px] uppercase tracking-widest text-nano-text">Method</div>
                            <div className="mt-1 text-[10px] text-white">{payoutMethodLabel(group)}</div>
                            <div className="mt-1 text-[10px] text-nano-yellow">{payoutReadinessLabel(group)}</div>
                          </div>
                          <div className="col-span-6 sm:col-span-2">
                            <div className="text-[10px] uppercase tracking-widest text-nano-text">Rows</div>
                            <div className="mt-1 text-sm text-white">{group.rows.length}</div>
                            {group.reversal_count > 0 && (
                              <div className="mt-1 text-[10px] text-orange-300">{group.reversal_count} reversal{group.reversal_count > 1 ? 's' : ''}</div>
                            )}
                          </div>
                          <div className="col-span-6 sm:col-span-2 flex justify-end items-center gap-2">
                            <button
                              onClick={() => toggleGroupExpansion(group.affiliate_id)}
                              aria-expanded={isExpanded}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wide text-nano-text bg-white/5 border border-nano-border rounded hover:bg-white/10 transition-colors"
                            >
                              <span>{isExpanded ? 'Hide details' : 'Details'}</span>
                              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-nano-border p-4 max-h-[360px] overflow-y-auto">
                            <div className="grid grid-cols-12 gap-3 text-[10px] uppercase tracking-widest text-nano-text bg-black/30 rounded-t-lg px-4 py-3">
                              <div className="col-span-4 sm:col-span-3">Type</div>
                              <div className="col-span-2 text-right">Amount</div>
                              <div className="col-span-3">Hold until</div>
                              <div className="col-span-3">Created</div>
                            </div>
                            <div className="divide-y divide-nano-border">
                              {group.rows.map(row => (
                                <div key={row.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center text-[11px] text-nano-text">
                                  <div className="col-span-4 sm:col-span-3">
                                    <div className="font-bold text-white">{getPayableRowTypeLabel(row)}</div>
                                    <div className="text-[10px] text-gray-500">{row.currency || 'USD'}</div>
                                  </div>
                                  <div className="col-span-2 text-right font-mono text-white">{fmt(row.amount_cents)}</div>
                                  <div className="col-span-3">
                                    {row.hold_until ? new Date(row.hold_until).toLocaleDateString() : '—'}
                                  </div>
                                  <div className="col-span-3 truncate">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-[10px] text-nano-text">
                              <div>
                                <div className="text-gray-500 uppercase tracking-widest">Minimum payout</div>
                                <div className="mt-1 text-white">{group.minimum_payout_cents ? fmt(group.minimum_payout_cents) : '-'}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 uppercase tracking-widest">Payable since</div>
                                <div className="mt-1 text-white">{group.rows[0]?.created_at ? new Date(group.rows[0].created_at).toLocaleDateString() : '-'}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 uppercase tracking-widest">Destination</div>
                                <div className="mt-1 text-white">{group.paypal_email || (group.payout_method === 'stripe_connect' ? 'Stripe Connect' : 'Not set')}</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-black border border-nano-border rounded-lg p-5">
                <div className="mb-4 grid gap-3 text-[10px] text-nano-text sm:grid-cols-3">
                  <div>
                    <div className="uppercase tracking-widest text-gray-500">Selected affiliates</div>
                    <div className="mt-1 font-mono text-white">{selectedSummary.count}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-widest text-gray-500">Stripe Connect</div>
                    <div className="mt-1 font-mono text-white">{selectedSummary.stripeConnect}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-widest text-gray-500">Manual payout</div>
                    <div className="mt-1 font-mono text-white">{selectedSummary.manual}</div>
                  </div>
                </div>
                {selectedSummary.stripeConnect > 0 && selectedSummary.manual > 0 && (
                  <div className="mb-4 rounded border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-300">
                    Selected affiliates include both manual and Stripe Connect payout methods.
                  </div>
                )}
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

          <div className="mb-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
              <div>
                <label htmlFor="batch-search" className="sr-only">Search payout batches</label>
                <input
                  id="batch-search"
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search batches by affiliate, email, batch ID, status, transfer ID, or failure..."
                  className="w-full rounded border border-nano-border bg-nano-dark px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-nano-yellow focus:outline-none"
                />
              </div>
              {(searchQuery || activeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveFilter('all');
                  }}
                  className="inline-flex items-center justify-center rounded border border-nano-border bg-black/50 px-3 py-2 text-xs uppercase tracking-widest text-nano-text hover:bg-white/5"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {BATCH_FILTERS.map(filter => (
                <button
                  key={filter.value}
                  onClick={() => setActiveFilter(filter.value)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                    activeFilter === filter.value
                      ? 'border-nano-yellow bg-nano-yellow/10 text-nano-yellow'
                      : 'border-nano-border bg-black/40 text-nano-text hover:bg-white/5'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {loadingBatches ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBatches.length === 0 ? (
                <div className="bg-black border border-nano-border rounded-lg p-12 text-center">
                  <DollarSign size={32} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 italic text-sm">
                    {batches.length === 0 ? 'No payout batches yet.' : 'No payout batches match your search.'}
                  </p>
                  <p className="text-[10px] text-nano-text mt-1">
                    {batches.length === 0
                      ? 'Create a draft batch from payable affiliates to begin processing.'
                      : 'Try a different query or clear your filters.'}
                  </p>
                </div>
              ) : (
                filteredBatches.map(batch => {
                  const payoutItems = Array.isArray(batch.payout_items) ? batch.payout_items : [];
                  const batchAffiliate = getBatchAffiliateSummary(batch);
                  const batchStatusSummary = getBatchStatusSummary(batch);
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
                  const isExpanded = expandedBatches.has(batch.id);

                  return (
                    <div key={batch.id} className="rounded-2xl border border-nano-border bg-black/40">
                      <div className="grid grid-cols-12 gap-3 p-4 items-center">
                        <div className="col-span-12 sm:col-span-3">
                          <div className="text-[10px] uppercase tracking-widest text-nano-text">Batch</div>
                          <div className="mt-1 font-mono text-sm text-white truncate" title={batch.id}>{batch.id.slice(0, 8)}...</div>
                          <div className="mt-2 text-[10px] text-nano-text">
                            <div className="font-bold text-white">{batchAffiliate.label}</div>
                            <div className="truncate text-gray-500">{batchAffiliate.sub}</div>
                          </div>
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                          <div className="text-[10px] uppercase tracking-widest text-nano-text">Status</div>
                          <div className={`mt-1 inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase ${BATCH_STATUS_COLORS[batch.status] || ''}`}>
                            {batch.status}
                          </div>
                          <div className="mt-2 text-[10px] text-nano-text">{batchStatusSummary}</div>
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                          <div className="text-[10px] uppercase tracking-widest text-nano-text">Total</div>
                          <div className="mt-1 font-mono text-sm text-white">{fmt(batch.total_amount_cents)}</div>
                        </div>
                        <div className="col-span-6 sm:col-span-1">
                          <div className="text-[10px] uppercase tracking-widest text-nano-text">Items</div>
                          <div className="mt-1 text-sm text-white">{payoutItems.length}</div>
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                          <div className="text-[10px] uppercase tracking-widest text-nano-text">Created</div>
                          <div className="mt-1 text-[11px] text-nano-text font-mono">{batch.created_at ? new Date(batch.created_at).toLocaleDateString() : '-'}</div>
                        </div>
                        <div className="col-span-12 sm:col-span-2 flex flex-wrap justify-end items-center gap-2">
                          {isActing && <Loader2 size={14} className="animate-spin text-nano-text" />}
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
                              {hasRetryableFailures ? 'Retry eligible payouts' : 'Send eligible payouts'}
                            </button>
                          )}
                          {(batch.status === 'paid' || batch.status === 'cancelled') && (
                            <span className="text-[10px] text-nano-text italic">
                              {batch.status === 'paid'
                                ? (batch.paid_at ? new Date(batch.paid_at).toLocaleDateString() : 'Paid')
                                : 'Cancelled'}
                            </span>
                          )}
                          <button
                            onClick={() => toggleBatchExpansion(batch.id)}
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wide text-nano-text bg-white/5 border border-nano-border rounded hover:bg-white/10 transition-colors"
                          >
                            <span>{isExpanded ? 'Collapse' : 'Details'}</span>
                            <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-nano-border p-4 max-h-[420px] overflow-y-auto">
                          <div className="grid grid-cols-12 gap-3 text-[10px] uppercase tracking-widest text-nano-text bg-black/30 rounded-t-lg px-4 py-3">
                            <div className="col-span-4 sm:col-span-3">Affiliate</div>
                            <div className="col-span-2 sm:col-span-1 text-right">Amount</div>
                            <div className="col-span-6 sm:col-span-2">State</div>
                            <div className="col-span-12 sm:col-span-3">Destination</div>
                            <div className="col-span-12 sm:col-span-3 text-right">Action</div>
                          </div>
                          <div className="divide-y divide-nano-border">
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
                              const diagExpanded = expandedDiagnostics.has(item.id);

                              return (
                                <div key={item.id} className="bg-black/20">
                                  <div className="grid grid-cols-12 gap-3 items-center px-4 py-3">
                                    <div className="col-span-4 sm:col-span-3">
                                      <div className="font-mono text-xs text-nano-yellow truncate">{affiliate?.code || item.affiliate_id?.slice(0, 8) || '-'}</div>
                                      <div className="text-[10px] text-nano-text truncate">{affiliate?.contact_email || '-'}</div>
                                    </div>
                                    <div className="col-span-2 sm:col-span-1 text-right font-mono text-xs text-white">{fmt(item.amount_cents)}</div>
                                    <div className="col-span-6 sm:col-span-2 text-[10px] text-nano-text">
                                      <div className={payoutState === 'Failed' ? 'text-red-400' : payoutState === 'Paid' ? 'text-green-400' : 'text-nano-text'}>
                                        {payoutState}
                                      </div>
                                      <div className="mt-1 text-[10px] text-nano-yellow">{eligibilityLabel}</div>
                                      {payoutFailure && (
                                        <div className="mt-1 truncate text-[10px] text-red-400" title={payoutFailure}>{payoutFailure}</div>
                                      )}
                                    </div>
                                    <div className="col-span-12 sm:col-span-3 text-[10px] text-nano-text font-mono truncate">
                                      {item.payment_destination || item.stripe_destination_account_id || item.paypal_email || 'Missing'}
                                    </div>
                                    <div className="col-span-12 sm:col-span-3 flex flex-col gap-2 items-end text-right">
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
                                          Send
                                        </button>
                                      ) : canRetryStripeConnect ? (
                                        <button
                                          onClick={() => handleSendStripeConnectPayouts(batch.id, [item.id])}
                                          disabled={Boolean(stripeProcessId)}
                                          className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/30 rounded hover:bg-nano-yellow/20 transition-colors disabled:opacity-40"
                                        >
                                          {isStripeItemProcessing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                          Retry
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => toggleDiagnostics(item.id)}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wide text-nano-text bg-white/5 border border-nano-border rounded hover:bg-white/10 transition-colors"
                                        >
                                          {diagExpanded ? 'Hide diagnostics' : 'View diagnostics'}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {diagExpanded && (
                                    <div className="bg-black/30 border-t border-nano-border px-4 py-3">
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
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
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
