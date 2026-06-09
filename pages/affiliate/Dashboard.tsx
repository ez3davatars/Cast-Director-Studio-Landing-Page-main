import React, { useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Banknote, CheckCircle, Copy, CreditCard, FileText, Link as LinkIcon, Loader2, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AffiliateDashboardProps {
  session: Session;
}

const money = (cents: number | null | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString() : '-';
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '-';
const shortRef = (value: string | null | undefined) => value ? `${value.slice(0, 12)}...` : '-';
const getAffiliatePayoutStatus = (row: any) => {
  const isStripeConnect = row.payment_method === 'stripe_connect' || row.payment_provider === 'stripe' || row.stripe_transfer_id || row.payout_failure_code;
  if (isStripeConnect && row.status === 'failed' && !row.stripe_transfer_id) {
    return 'Transfer failed — waiting for admin retry';
  }
  return row.status;
};
const getAffiliateTransferStatus = (row: any) => {
  if (row.payout_failure_code === 'balance_insufficient') return 'Platform balance not yet available';
  if (row.status === 'failed' && !row.stripe_transfer_id) return 'Transfer failed';
  return row.stripe_transfer_status || '-';
};

const panelClass = 'rounded-sm border border-nano-border bg-black/40 p-5';

const getPublicSiteBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_PUBLIC_SITE_URL || import.meta.env.VITE_SITE_URL;
  const fallbackUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return (configuredUrl || fallbackUrl).replace(/\/+$/, '');
};

const buildTrackingUrl = (code: string) => `${getPublicSiteBaseUrl()}/a/${code}`;

const getRequirementsDue = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (Array.isArray(value.currently_due)) return value.currently_due.filter(Boolean);
  if (Array.isArray(value.eventually_due)) return value.eventually_due.filter(Boolean);
  if (typeof value === 'object') return Object.values(value).flat().filter(Boolean) as string[];
  return [];
};

const getConnectButtonLabel = (affiliate: any) => {
  const requirementsDue = getRequirementsDue(affiliate?.stripe_connect_requirements_due);
  const isReady = affiliate?.stripe_connect_account_id && affiliate?.stripe_connect_payouts_enabled && requirementsDue.length === 0;
  if (isReady) return 'Manage payout account';
  if (affiliate?.stripe_connect_account_id) return 'Continue setup';
  return 'Set up direct deposit through Stripe';
};

const readFunctionErrorPayload = async (error: any) => {
  try {
    const context = error?.context;
    if (context && typeof context.json === 'function') return await context.json();
  } catch {
    return null;
  }
  return null;
};

const resetConnectFields = (prev: any) => ({
  ...prev,
  payout_method: 'manual',
  stripe_connect_account_id: null,
  stripe_connect_onboarding_status: 'not_started',
  stripe_connect_payouts_enabled: false,
  stripe_connect_charges_enabled: false,
  stripe_connect_requirements_due: [],
});

const AffiliateDashboard: React.FC<AffiliateDashboardProps> = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [affiliate, setAffiliate] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [connectActionLoading, setConnectActionLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAffiliateDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: affiliateRow, error: affiliateErr } = await supabase
          .from('affiliates')
          .select(`
            id,
            code,
            status,
            commission_rate,
            commission_duration_months,
            attribution_window_days,
            payout_hold_days,
            minimum_payout_cents,
            payout_method,
            paypal_email,
            stripe_connect_account_id,
            stripe_connect_onboarding_status,
            stripe_connect_payouts_enabled,
            stripe_connect_charges_enabled,
            stripe_connect_requirements_due
          `)
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (affiliateErr) throw affiliateErr;
        if (cancelled) return;

        setAffiliate(affiliateRow || null);
        if (!affiliateRow) return;

        if (affiliateRow.status !== 'active') {
          setStats(null);
          setLinks([]);
          setReferrals([]);
          setCommissions([]);
          setPayouts([]);
          setAssets([]);
          return;
        }

        const [statsRes, linksRes, referralsRes, commissionsRes, payoutsRes, assetsRes] = await Promise.allSettled([
          supabase.rpc('get_affiliate_dashboard_stats', { p_affiliate_id: affiliateRow.id }),
          supabase
            .from('affiliate_links')
            .select('id, code, destination_url, campaign, is_active, click_count, created_at')
            .eq('affiliate_id', affiliateRow.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('referrals')
            .select('id, status, attributed_at, commission_expires_at')
            .eq('affiliate_id', affiliateRow.id)
            .order('attributed_at', { ascending: false })
            .limit(50),
          supabase
            .from('commission_ledger')
            .select('id, type, amount_cents, currency, hold_until, created_at')
            .eq('affiliate_id', affiliateRow.id)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('payout_items')
            .select('id, amount_cents, status, paypal_email, payment_provider, payment_method, payment_destination, payment_reference, paid_at, paid_notes, stripe_transfer_id, stripe_transfer_status, stripe_payout_id, stripe_payout_status, stripe_payout_arrival_date, payout_failure_code, payout_failure_message, payout_batches(id, status, paid_at, created_at)')
            .eq('affiliate_id', affiliateRow.id)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('affiliate_assets')
            .select('id, title, type, description, public_url, storage_path, width, height, created_at')
            .eq('is_active', true)
            .order('created_at', { ascending: false }),
        ]);

        if (statsRes.status === 'fulfilled' && !statsRes.value.error) {
          const value = statsRes.value.data;
          setStats(Array.isArray(value) ? value[0] || null : value || null);
        } else {
          throw new Error(statsRes.status === 'rejected' ? statsRes.reason?.message : statsRes.value.error?.message);
        }

        const applySettled = (result: PromiseSettledResult<any>, setter: (rows: any[]) => void, label: string) => {
          if (result.status === 'fulfilled' && !result.value.error) {
            setter(result.value.data || []);
            return;
          }
          const message = result.status === 'rejected' ? result.reason?.message : result.value.error?.message;
          throw new Error(message || `Failed to load ${label}.`);
        };

        applySettled(linksRes, setLinks, 'affiliate links');
        applySettled(referralsRes, setReferrals, 'referrals');
        applySettled(commissionsRes, setCommissions, 'commissions');
        applySettled(payoutsRes, setPayouts, 'payouts');
        applySettled(assetsRes, setAssets, 'marketing assets');
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load affiliate dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAffiliateDashboard();
    return () => { cancelled = true; };
  }, [session.user.id, refreshKey]);

  const statCards = useMemo(() => ([
    ['Total clicks', stats?.clicks_count ?? 0],
    ['Converted clicks', stats?.converted_clicks_count ?? 0],
    ['Referrals', stats?.referrals_count ?? 0],
    ['Paid customers', stats?.paid_customers_count ?? 0],
    ['Pending commission', money(stats?.pending_commission_cents)],
    ['Payable commission', money(stats?.payable_commission_cents)],
    ['Paid commission', money(stats?.paid_commission_cents)],
  ]), [stats]);

  const copyLink = async (link: any) => {
    const fullUrl = buildTrackingUrl(link.code);
    await navigator.clipboard.writeText(fullUrl);
    setCopiedLinkId(link.id);
    setTimeout(() => setCopiedLinkId(null), 1600);
  };

  const copyAssetValue = async (asset: any, mode: 'url' | 'text') => {
    const value = mode === 'url'
      ? asset.public_url || asset.storage_path || ''
      : asset.description || '';
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedAssetId(`${asset.id}:${mode}`);
    setTimeout(() => setCopiedAssetId(null), 1600);
  };

  const handleStripeConnectSetup = async () => {
    if (!affiliate) return;
    setConnectActionLoading(true);
    setConnectError(null);
    setConnectMessage(null);

    try {
      if (!affiliate.stripe_connect_account_id) {
        const { data, error: createErr } = await supabase.functions.invoke('create-affiliate-connect-account', {
          body: {},
        });
        if (createErr) throw new Error(createErr.message);
        setAffiliate((prev: any) => ({
          ...prev,
          stripe_connect_account_id: data?.stripe_connect_account_id || prev?.stripe_connect_account_id,
          stripe_connect_onboarding_status: data?.stripe_connect_onboarding_status || prev?.stripe_connect_onboarding_status,
          payout_method: 'stripe_connect',
        }));
      }

      const { data, error: linkErr } = await supabase.functions.invoke('create-affiliate-connect-onboarding-link', {
        body: {},
      });
      if (linkErr) {
        const payload = await readFunctionErrorPayload(linkErr);
        if (payload?.reset) {
          setAffiliate(resetConnectFields);
          setConnectMessage('Your previous Stripe direct deposit setup was removed. Please set it up again.');
          setRefreshKey(k => k + 1);
          setConnectActionLoading(false);
          return;
        }
        throw new Error(payload?.error || linkErr.message);
      }
      if (!data?.url) throw new Error('Stripe onboarding link was not returned.');

      window.location.assign(data.url);
    } catch (err: any) {
      setConnectError(err.message || 'Unable to start Stripe direct deposit setup.');
      setConnectActionLoading(false);
    }
  };

  const handleSyncConnectStatus = async () => {
    setSyncLoading(true);
    setConnectError(null);
    setConnectMessage(null);
    try {
      const { data, error: syncErr } = await supabase.functions.invoke('sync-affiliate-connect-account', {
        body: {},
      });
      if (syncErr) {
        const payload = await readFunctionErrorPayload(syncErr);
        throw new Error(payload?.error || syncErr.message);
      }
      if (data?.reset) {
        setAffiliate(resetConnectFields);
        setConnectMessage('Your previous Stripe direct deposit setup was removed. Please set it up again.');
        setRefreshKey(k => k + 1);
        return;
      }
      setConnectMessage('Stripe payout account status refreshed.');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setConnectError(err.message || 'Unable to refresh Stripe payout account status.');
    } finally {
      setSyncLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="rounded-sm border border-nano-border bg-nano-panel/40 p-12 text-center text-nano-text animate-pulse">
            Loading affiliate dashboard...
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="rounded-sm border border-red-500/50 bg-red-500/10 p-8 text-red-400 font-mono text-sm">
            {error}
          </div>
        </div>
      </section>
    );
  }

  if (!affiliate) {
    return (
      <section className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className={panelClass}>
            <UserCheck className="text-nano-yellow mb-4" size={28} />
            <h2 className="text-3xl font-bold mb-2">Affiliate Program</h2>
            <p className="text-nano-text">You do not have an affiliate account yet. Affiliate access is invite-only and managed by Cast Director Studio.</p>
          </div>
        </div>
      </section>
    );
  }

  if (affiliate.status === 'pending' || affiliate.status === 'suspended') {
    const isPending = affiliate.status === 'pending';
    return (
      <section className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className={panelClass}>
            <ShieldAlert className={isPending ? 'text-nano-yellow mb-4' : 'text-red-400 mb-4'} size={28} />
            <h2 className="text-3xl font-bold mb-2">{isPending ? 'Affiliate Account Pending' : 'Affiliate Account Suspended'}</h2>
            <p className="text-nano-text">
              {isPending
                ? 'Your affiliate account is pending approval. Dashboard data will appear once your account is active.'
                : 'Your affiliate account is currently suspended. Contact Cast Director Studio support for assistance.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-2">Affiliate Dashboard</h2>
          <p className="text-nano-text">Signed in as {session.user.email}. Affiliate code: <span className="text-nano-yellow font-mono">{affiliate.code}</span></p>
        </div>

        <div className="space-y-8">
          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {statCards.map(([label, value]) => (
                <div key={label} className="rounded-sm border border-nano-border bg-black/50 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-nano-text mb-2">{label}</div>
                  <div className="text-2xl font-bold font-mono text-white">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Links</h3>
            {links.length === 0 ? (
              <p className="text-sm text-nano-text italic">No affiliate links are assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {links.map(link => {
                  const fullUrl = buildTrackingUrl(link.code);
                  return (
                    <div key={link.id} className="rounded-sm border border-nano-border bg-black/40 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-white font-mono text-sm truncate">
                            <LinkIcon size={14} className="text-nano-yellow shrink-0" />
                            <span className="truncate">{fullUrl}</span>
                          </div>
                          <div className="mt-2 text-xs text-nano-text">
                            Campaign: {link.campaign || 'default'} · Destination: {link.destination_url || '/'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyLink(link)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-sm border border-nano-yellow/30 bg-nano-yellow/10 text-nano-yellow text-xs font-bold uppercase tracking-wider hover:bg-nano-yellow/20 transition-colors"
                        >
                          {copiedLinkId === link.id ? <CheckCircle size={14} /> : <Copy size={14} />}
                          {copiedLinkId === link.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Referrals</h3>
            {referrals.length === 0 ? (
              <p className="text-sm text-nano-text italic">No referrals yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="text-[10px] uppercase tracking-widest text-nano-text">
                    <tr>
                      <th className="p-3">Status</th>
                      <th className="p-3">Attributed</th>
                      <th className="p-3">Commission Through</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map(row => (
                      <tr key={row.id} className="border-t border-nano-border/60">
                        <td className="p-3 text-sm text-white">{row.status}</td>
                        <td className="p-3 text-sm text-nano-text font-mono">{date(row.attributed_at)}</td>
                        <td className="p-3 text-sm text-nano-text font-mono">{date(row.commission_expires_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Commissions</h3>
            {commissions.length === 0 ? (
              <p className="text-sm text-nano-text italic">No commission ledger entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="text-[10px] uppercase tracking-widest text-nano-text">
                    <tr>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3">Hold Status</th>
                      <th className="p-3">Hold Until</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map(row => {
                      const inHold = row.hold_until && new Date(row.hold_until) > new Date();
                      return (
                        <tr key={row.id} className="border-t border-nano-border/60">
                          <td className={row.type === 'reversal' ? 'p-3 text-sm text-red-400' : 'p-3 text-sm text-green-400'}>{row.type}</td>
                          <td className="p-3 text-sm text-white font-mono text-right">{money(row.amount_cents)}</td>
                          <td className="p-3 text-sm text-nano-text">{inHold ? 'In hold' : 'Released'}</td>
                          <td className="p-3 text-sm text-nano-text font-mono">{date(row.hold_until)}</td>
                          <td className="p-3 text-sm text-nano-text font-mono">{date(row.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Payouts</h3>
            {payouts.length === 0 ? (
              <p className="text-sm text-nano-text italic">No payout records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="text-[10px] uppercase tracking-widest text-nano-text">
                    <tr>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Transfer Status</th>
                      <th className="p-3">Bank Payout Status</th>
                      <th className="p-3">Reference</th>
                      <th className="p-3">Paid At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map(row => {
                      const isStripeConnect = row.payment_method === 'stripe_connect' || row.payment_provider === 'stripe' || row.stripe_transfer_id;
                      return (
                        <tr key={row.id} className="border-t border-nano-border/60">
                          <td className="p-3 text-sm text-white">{getAffiliatePayoutStatus(row)}</td>
                          <td className="p-3 text-sm text-white font-mono text-right">{money(row.amount_cents)}</td>
                          <td className="p-3 text-sm text-nano-text">
                            {isStripeConnect ? 'Direct deposit through Stripe' : (row.payment_method || row.payment_provider || 'manual')}
                          </td>
                          <td className="p-3 text-sm text-nano-text font-mono">{getAffiliateTransferStatus(row)}</td>
                          <td className="p-3 text-sm text-nano-text font-mono">{row.stripe_payout_status || '-'}</td>
                          <td className="p-3 text-sm text-nano-text font-mono" title={row.payment_reference || row.stripe_transfer_id || row.stripe_payout_id || ''}>
                            {shortRef(row.payment_reference || row.stripe_transfer_id || row.stripe_payout_id)}
                          </td>
                          <td className="p-3 text-sm text-nano-text font-mono">{dateTime(row.paid_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Marketing Assets</h3>
            {assets.length === 0 ? (
              <p className="text-sm text-nano-text italic">No marketing assets are available yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {assets.map(asset => (
                  <div key={asset.id} className="rounded-sm border border-nano-border bg-black/40 p-4">
                    <div className="flex items-start gap-3">
                      <FileText size={18} className="text-nano-yellow shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-white font-bold">{asset.title}</div>
                        <div className="text-xs text-nano-text uppercase tracking-wider mt-1">{asset.type}</div>
                        {asset.description && <p className="text-sm text-nano-text mt-2">{asset.description}</p>}
                        {(asset.public_url || asset.storage_path) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <a
                              href={asset.public_url || asset.storage_path}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-sm border border-nano-yellow/30 bg-nano-yellow/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow hover:bg-nano-yellow/20"
                            >
                              Open Asset
                            </a>
                            <button
                              type="button"
                              onClick={() => copyAssetValue(asset, 'url')}
                              className="inline-flex items-center gap-2 rounded-sm border border-nano-border bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-text hover:text-white"
                            >
                              <Copy size={13} />
                              {copiedAssetId === `${asset.id}:url` ? 'Copied' : 'Copy Link'}
                            </button>
                          </div>
                        )}
                        {asset.description && (
                          <button
                            type="button"
                            onClick={() => copyAssetValue(asset, 'text')}
                            className="mt-2 inline-flex items-center gap-2 rounded-sm border border-nano-border bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-text hover:text-white"
                          >
                            <Copy size={13} />
                            {copiedAssetId === `${asset.id}:text` ? 'Copied' : 'Copy Text'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Payout Setup</h3>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
              <div className="rounded-sm border border-nano-border bg-black/40 p-4">
                <div className="flex items-start gap-3">
                  <Banknote size={20} className="text-nano-yellow shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm text-white font-bold">Manual payout</div>
                    <p className="text-sm text-nano-text mt-2">
                      Manual payout details are managed by Cast Director Studio.
                    </p>
                    {(affiliate.payout_method || 'manual') === 'manual' && (
                      <span className="inline-block mt-3 rounded-sm border border-nano-yellow/30 bg-nano-yellow/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-nano-yellow">
                        Current method
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-sm border border-nano-border bg-black/40 p-4">
                <div className="flex items-start gap-3">
                  <CreditCard size={20} className="text-nano-yellow shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-bold">Direct deposit through Stripe</div>
                    <p className="text-sm text-nano-text mt-2">
                      Set up secure direct deposits to your bank account or debit card through Stripe.
                    </p>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[
                        ['Current method', affiliate.payout_method || 'manual'],
                        ['Onboarding', affiliate.stripe_connect_onboarding_status || 'not started'],
                        ['Payouts enabled', affiliate.stripe_connect_payouts_enabled ? 'yes' : 'no'],
                        ['Charges enabled', affiliate.stripe_connect_charges_enabled ? 'yes' : 'no'],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-sm border border-nano-border bg-black/30 p-3">
                          <div className="text-[10px] uppercase tracking-widest text-nano-text">{label}</div>
                          <div className="mt-1 font-mono text-white">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 rounded-sm border border-nano-border bg-black/30 p-3 text-xs">
                      <div className="text-[10px] uppercase tracking-widest text-nano-text">Requirements due</div>
                      <div className="mt-1 text-nano-text">
                        {getRequirementsDue(affiliate.stripe_connect_requirements_due).length === 0
                          ? 'None'
                          : `${getRequirementsDue(affiliate.stripe_connect_requirements_due).length} item(s) need attention`}
                      </div>
                    </div>

                    {connectError && (
                      <div className="mt-3 rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-xs font-mono text-red-400">
                        {connectError}
                      </div>
                    )}
                    {connectMessage && (
                      <div className="mt-3 rounded-sm border border-green-500/30 bg-green-500/10 p-3 text-xs font-mono text-green-400">
                        {connectMessage}
                      </div>
                    )}

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleStripeConnectSetup}
                        disabled={connectActionLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-sm border border-nano-yellow/30 bg-nano-yellow/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow transition-colors hover:bg-nano-yellow/20 disabled:opacity-50"
                      >
                        {connectActionLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                        {connectActionLoading ? 'Opening Stripe...' : getConnectButtonLabel(affiliate)}
                      </button>
                      {affiliate.stripe_connect_account_id && (
                        <button
                          type="button"
                          onClick={handleSyncConnectStatus}
                          disabled={syncLoading}
                          className="inline-flex items-center justify-center gap-2 rounded-sm border border-nano-border bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-text transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                        >
                          {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          Refresh status
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-nano-yellow mb-4">Program Terms</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-sm border border-nano-border bg-black/40 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {[
                    ['Commission rate', `${(Number(affiliate.commission_rate || 0) * 100).toFixed(0)}%`],
                    ['Commission duration', `${affiliate.commission_duration_months || 0} months`],
                    ['Attribution window', `${affiliate.attribution_window_days || 0} days`],
                    ['Payout hold period', `${affiliate.payout_hold_days || 0} days`],
                    ['Minimum payout', money(affiliate.minimum_payout_cents)],
                    ['Payout method status', affiliate.payout_method || 'manual'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-sm border border-nano-border bg-black/30 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-nano-text">{label}</div>
                      <div className="mt-1 font-mono text-white">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-sm border border-nano-border bg-black/40 p-4 space-y-3 text-sm text-nano-text">
                <p>Refunds, disputes, chargebacks, and reversals may reduce future payable commissions.</p>
                <p>Direct deposit is handled securely through Stripe. Cast Director Studio does not store bank account details.</p>
                <p className="text-xs">
                  Support contact: <span className="text-nano-yellow font-mono">support@castdirectorstudio.com</span>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
};

export default AffiliateDashboard;
