import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  Loader2,
  UserCheck,
  Users,
  ShoppingBag,
  Package,
  Mail,
  Activity,
  ArrowRight,
  ShieldCheck,
  Download,
  FileText,
  CalendarDays,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const fmtMoney = (value: number | null | undefined) =>
  value == null ? '--' : `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCount = (value: number | null | undefined) =>
  value == null ? '--' : String(value);

const cardClass = 'bg-black border border-nano-border rounded-xl p-4 shadow-sm';
const sectionHeaderClass = 'flex flex-col gap-2';
const buttonClass = 'inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded border border-nano-border bg-white/5 text-nano-text hover:text-white hover:bg-white/10 transition-colors';

interface AffiliateDashboardMetrics {
  totalAffiliates: number | null;
  activeAffiliates: number | null;
  pendingAffiliates: number | null;
  suspendedAffiliates: number | null;
  totalClicks: number | null;
  totalReferrals: number | null;
  commissionsInHoldCents: number | null;
  payableCommissionsCents: number | null;
  paidCommissionsCents: number | null;
  pendingPayoutBatches: number | null;
}

interface DashboardMetrics extends AffiliateDashboardMetrics {
  totalRevenue: number | null;
  recentRevenue: number | null;
  totalOrders: number | null;
  recentOrders: number | null;
  activeSubscriptions: number | null;
  totalLicenses: number | null;
  totalDownloads: number | null;
  paymentWarnings: number | null;
  customers: number | null;
  openContactLeads: number | null;
  recentEmails: number | null;
  pendingApplications: number | null;
  failedPayoutItems: number | null;
  latestWebhookAt: string | null;
  failedWebhooks: number | null;
}

const emptyMetrics: DashboardMetrics = {
  totalRevenue: null,
  recentRevenue: null,
  totalOrders: null,
  recentOrders: null,
  activeSubscriptions: null,
  totalLicenses: null,
  totalDownloads: null,
  paymentWarnings: null,
  customers: null,
  openContactLeads: null,
  recentEmails: null,
  pendingApplications: null,
  totalAffiliates: null,
  activeAffiliates: null,
  pendingAffiliates: null,
  suspendedAffiliates: null,
  totalClicks: null,
  totalReferrals: null,
  commissionsInHoldCents: null,
  payableCommissionsCents: null,
  paidCommissionsCents: null,
  pendingPayoutBatches: null,
  failedPayoutItems: null,
  latestWebhookAt: null,
  failedWebhooks: null,
};

interface RecentOrder {
  id: string;
  order_number: string | null;
  total_amount: number | null;
  payment_status: string | null;
  created_at: string | null;
}

interface RecentApplication {
  id: string;
  email: string | null;
  status: string | null;
  created_at: string | null;
}

interface RecentBatch {
  id: string;
  status: string | null;
  total_amount_cents: number | null;
  created_at: string | null;
}

interface RecentWebhookEvent {
  id: string;
  event_type: string | null;
  processing_status: string | null;
  created_at: string | null;
}

const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [recentBatches, setRecentBatches] = useState<RecentBatch[]>([]);
  const [recentWebhookEvents, setRecentWebhookEvents] = useState<RecentWebhookEvent[]>([]);

  const loadDashboardMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last30Iso = last30Days.toISOString();

      const [
        totalOrdersRes,
        recentOrdersCountRes,
        totalRevenueRes,
        recentRevenueRes,
        activeSubscriptionsRes,
        licensesRes,
        downloadsRes,
        paymentWarningsRes,
        contactsRes,
        openLeadsRes,
        recentEmailsRes,
        totalAffiliatesRes,
        activeAffiliatesRes,
        pendingAffiliatesRes,
        suspendedAffiliatesRes,
        pendingAppsRes,
        clicksRes,
        referralsRes,
        ledgerRes,
        paidItemsRes,
        pendingBatchesRes,
        failedPayoutItemsRes,
        latestWebhookRes,
        failedWebhooksRes,
        recentWebhookRes,
        recentOrdersRes,
        recentApplicationsRes,
        recentBatchesRes,
      ] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', last30Iso),
        supabase.from('orders').select('sum(total_amount)'),
        supabase.from('orders').select('sum(total_amount)').gte('created_at', last30Iso),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('licenses').select('id', { count: 'exact', head: true }),
        supabase.from('downloads').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }).or('payment_status.ne.paid,fulfillment_status.ne.fulfilled'),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('crm_conversations').select('id', { count: 'exact', head: true }).not('status', 'in', '(resolved,closed)'),
        supabase.from('email_sends').select('id', { count: 'exact', head: true }).gte('created_at', last30Iso),
        supabase.from('affiliates').select('id', { count: 'exact', head: true }),
        supabase.from('affiliates').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('affiliates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('affiliates').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
        supabase.from('affiliate_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('affiliate_clicks').select('id', { count: 'exact', head: true }),
        supabase.from('referrals').select('id', { count: 'exact', head: true }),
        supabase
          .from('commission_ledger')
          .select('type, amount_cents, hold_until, payout_batch_id')
          .is('payout_batch_id', null),
        supabase.from('payout_items').select('amount_cents').eq('status', 'paid'),
        supabase.from('payout_batches').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('payout_items').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('stripe_webhooks').select('created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('stripe_webhooks').select('id', { count: 'exact', head: true }).eq('processing_status', 'failed'),
        supabase.from('stripe_webhooks').select('id, event_type, processing_status, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('orders').select('id, order_number, total_amount, payment_status, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('affiliate_applications').select('id, email, status, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('payout_batches').select('id, status, total_amount_cents, created_at').order('created_at', { ascending: false }).limit(3),
      ]);

      const nowIso = now.toISOString();

      if (ledgerRes.error) throw ledgerRes.error;
      if (paidItemsRes.error) throw paidItemsRes.error;

      const ledgerRows = ledgerRes.data || [];
      let commissionsInHoldCents = 0;
      let payableCommissionsCents = 0;

      for (const row of ledgerRows) {
        const signedAmount = row.type === 'earned' ? row.amount_cents : -row.amount_cents;
        if (row.hold_until && row.hold_until > nowIso) {
          commissionsInHoldCents += signedAmount;
        } else {
          payableCommissionsCents += signedAmount;
        }
      }

      setMetrics({
        totalRevenue: Array.isArray(totalRevenueRes.data) && totalRevenueRes.data[0]?.sum ? Number(totalRevenueRes.data[0].sum) : null,
        recentRevenue: Array.isArray(recentRevenueRes.data) && recentRevenueRes.data[0]?.sum ? Number(recentRevenueRes.data[0].sum) : null,
        totalOrders: totalOrdersRes.count ?? null,
        recentOrders: recentOrdersCountRes.count ?? null,
        activeSubscriptions: activeSubscriptionsRes.count ?? null,
        totalLicenses: licensesRes.count ?? null,
        totalDownloads: downloadsRes.count ?? null,
        paymentWarnings: paymentWarningsRes.count ?? null,
        customers: contactsRes.count ?? null,
        openContactLeads: openLeadsRes.count ?? null,
        recentEmails: recentEmailsRes.count ?? null,
        pendingApplications: pendingAppsRes.count ?? null,
        totalAffiliates: totalAffiliatesRes.count ?? null,
        activeAffiliates: activeAffiliatesRes.count ?? null,
        pendingAffiliates: pendingAffiliatesRes.count ?? null,
        suspendedAffiliates: suspendedAffiliatesRes.count ?? null,
        totalClicks: clicksRes.count ?? null,
        totalReferrals: referralsRes.count ?? null,
        commissionsInHoldCents: Math.max(0, commissionsInHoldCents),
        payableCommissionsCents: Math.max(0, payableCommissionsCents),
        paidCommissionsCents: (paidItemsRes.data || []).reduce((sum, row) => sum + (row.amount_cents || 0), 0),
        pendingPayoutBatches: pendingBatchesRes.count ?? null,
        failedPayoutItems: failedPayoutItemsRes.count ?? null,
        latestWebhookAt: latestWebhookRes.data?.[0]?.created_at ?? null,
        failedWebhooks: failedWebhooksRes.count ?? null,
      });

      setRecentOrders((recentOrdersRes.data || []) as RecentOrder[]);
      setRecentApplications((recentApplicationsRes.data || []) as RecentApplication[]);
      setRecentBatches((recentBatchesRes.data || []) as RecentBatch[]);
      setRecentWebhookEvents((recentWebhookRes.data || []) as RecentWebhookEvent[]);
    } catch (err: any) {
      console.warn('Dashboard metrics load failed:', err);
      setError(err.message || 'Failed to load operations dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboardMetrics(); }, [loadDashboardMetrics]);

  if (loading) {
    return (
      <div className="space-y-8">
        <section>
          <div className="mb-6">
            <h2 className="text-3xl font-bold font-mono tracking-wide">Operations Overview</h2>
            <p className="text-sm text-nano-text mt-2 max-w-3xl">
              Monitor sales, customers, fulfillment, affiliate activity, payouts, and system health.
            </p>
          </div>
        </section>
        <div className="rounded-xl border border-nano-border bg-black/80 p-10 text-center">
          <Loader2 size={20} className="animate-spin mx-auto mb-4 text-nano-yellow" />
          <div className="text-sm text-nano-text">Loading operations overview...</div>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { label: 'Revenue (30d)', value: fmtMoney(metrics.recentRevenue), icon: <Banknote size={18} className="text-nano-yellow" /> },
    { label: 'Orders', value: fmtCount(metrics.totalOrders), icon: <ShoppingBag size={18} className="text-nano-yellow" /> },
    { label: 'Active Subscriptions', value: fmtCount(metrics.activeSubscriptions), icon: <Package size={18} className="text-nano-yellow" /> },
    { label: 'Customers', value: fmtCount(metrics.customers), icon: <Users size={18} className="text-nano-yellow" /> },
    { label: 'Open Contact Leads', value: fmtCount(metrics.openContactLeads), icon: <Mail size={18} className="text-nano-yellow" /> },
    { label: 'Failed Webhooks', value: fmtCount(metrics.failedWebhooks), icon: <Activity size={18} className="text-nano-yellow" /> },
  ];

  const affiliateCards = [
    { label: 'Total Affiliates', value: fmtCount(metrics.totalAffiliates) },
    { label: 'Active Affiliates', value: fmtCount(metrics.activeAffiliates) },
    { label: 'Pending Affiliates', value: fmtCount(metrics.pendingAffiliates) },
    { label: 'Suspended Affiliates', value: fmtCount(metrics.suspendedAffiliates) },
    { label: 'Pending Applications', value: fmtCount(metrics.pendingApplications) },
    { label: 'Total Affiliate Clicks', value: fmtCount(metrics.totalClicks) },
    { label: 'Conversions / Referrals', value: fmtCount(metrics.totalReferrals) },
    { label: 'Commissions In Hold', value: fmtMoney(metrics.commissionsInHoldCents) },
    { label: 'Payable Commissions', value: fmtMoney(metrics.payableCommissionsCents) },
    { label: 'Paid Commissions', value: fmtMoney(metrics.paidCommissionsCents) },
    { label: 'Pending Payout Batches', value: fmtCount(metrics.pendingPayoutBatches) },
    { label: 'Failed Payout Items', value: fmtCount(metrics.failedPayoutItems) },
  ];

  const commerceCards = [
    { label: 'Total Orders', value: fmtCount(metrics.totalOrders), icon: <ShoppingBag size={18} /> },
    { label: 'Recent Orders (30d)', value: fmtCount(metrics.recentOrders), icon: <CalendarDays size={18} /> },
    { label: 'Active Subscriptions', value: fmtCount(metrics.activeSubscriptions), icon: <Package size={18} /> },
    { label: 'Active Licenses', value: fmtCount(metrics.totalLicenses), icon: <FileText size={18} /> },
    { label: 'Downloads', value: fmtCount(metrics.totalDownloads), icon: <Download size={18} /> },
    { label: 'Payment / Fulfillment Warnings', value: fmtCount(metrics.paymentWarnings), icon: <AlertTriangle size={18} /> },
  ];

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-6">
          <h2 className="text-3xl font-bold font-mono tracking-wide">Operations Overview</h2>
          <p className="text-sm text-nano-text mt-2 max-w-3xl">
            Monitor sales, customers, fulfillment, affiliate activity, payouts, and system health.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <div key={card.label} className={cardClass}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-widest text-nano-text font-bold">{card.label}</div>
              {card.icon}
            </div>
            <div className="text-3xl font-bold font-mono text-white">{card.value}</div>
          </div>
        ))}
      </section>

      <section className={cardClass}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-5">
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-nano-yellow">
              <ShoppingBag size={18} />
              <h3 className="text-sm font-bold uppercase tracking-widest">Commerce</h3>
            </div>
            <p className="text-xs text-nano-text max-w-2xl">
              Orders, subscriptions, licenses, and downloads at a glance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/orders" className={buttonClass}>
              <ArrowRight size={12} /> Orders
            </Link>
            <Link to="/admin/subscriptions" className={buttonClass}>
              <ArrowRight size={12} /> Subscriptions
            </Link>
            <Link to="/admin/licenses" className={buttonClass}>
              <ArrowRight size={12} /> Licenses
            </Link>
            <Link to="/admin/downloads" className={buttonClass}>
              <ArrowRight size={12} /> Downloads
            </Link>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {commerceCards.map((card) => (
            <div key={card.label} className="bg-black/80 rounded-xl p-4 border border-nano-border">
              <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-widest text-nano-text font-bold">
                <span>{card.label}</span>
                {card.icon}
              </div>
              <div className="text-2xl font-bold font-mono text-white">{card.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-5">
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-nano-yellow">
              <Users size={18} />
              <h3 className="text-sm font-bold uppercase tracking-widest">Customers & CRM</h3>
            </div>
            <p className="text-xs text-nano-text max-w-2xl">
              Track customer count, open conversations, and email activity without exposing private details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/customers" className={buttonClass}>
              <ArrowRight size={12} /> Customers
            </Link>
            <Link to="/admin/leads" className={buttonClass}>
              <ArrowRight size={12} /> Contact Leads
            </Link>
            <Link to="/admin/emails" className={buttonClass}>
              <ArrowRight size={12} /> Emails
            </Link>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {[
            { label: 'Customers', value: fmtCount(metrics.customers), icon: <Users size={18} /> },
            { label: 'Open Contact Leads', value: fmtCount(metrics.openContactLeads), icon: <Mail size={18} /> },
            { label: 'Recent Email Sends (30d)', value: fmtCount(metrics.recentEmails), icon: <Mail size={18} /> },
          ].map((card) => (
            <div key={card.label} className="bg-black/80 rounded-xl p-4 border border-nano-border">
              <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-widest text-nano-text font-bold">
                <span>{card.label}</span>
                {card.icon}
              </div>
              <div className="text-2xl font-bold font-mono text-white">{card.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-5">
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-nano-yellow">
              <UserCheck size={18} />
              <h3 className="text-sm font-bold uppercase tracking-widest">Affiliate Program</h3>
            </div>
            <p className="text-xs text-nano-text max-w-2xl">
              Affiliate health metrics are aggregated so raw click streams remain protected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/affiliates" className={buttonClass}>
              <ArrowRight size={12} /> Manage Affiliates
            </Link>
            <Link to="/admin/affiliate-applications" className={buttonClass}>
              <ArrowRight size={12} /> Review Applications
            </Link>
            <Link to="/admin/payouts" className={buttonClass}>
              <ArrowRight size={12} /> Manage Payouts
            </Link>
            <Link to="/admin/affiliate-assets" className={buttonClass}>
              <ArrowRight size={12} /> Affiliate Assets
            </Link>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-4">
          {affiliateCards.map((card) => (
            <div key={card.label} className="bg-black/80 rounded-xl p-4 border border-nano-border">
              <div className="text-xs uppercase tracking-widest text-nano-text font-bold mb-3">{card.label}</div>
              <div className="text-2xl font-bold font-mono text-white">{card.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-5">
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-nano-yellow">
              <ShieldCheck size={18} />
              <h3 className="text-sm font-bold uppercase tracking-widest">System Health</h3>
            </div>
            <p className="text-xs text-nano-text max-w-2xl">
              Monitor webhook processing, payout health, and operational warnings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/webhooks" className={buttonClass}>
              <ArrowRight size={12} /> Webhooks
            </Link>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {[
            { label: 'Latest Webhook Event', value: metrics.latestWebhookAt ? new Date(metrics.latestWebhookAt).toLocaleString() : '--', icon: <Activity size={18} /> },
            { label: 'Failed Webhook Events', value: fmtCount(metrics.failedWebhooks), icon: <AlertTriangle size={18} /> },
            { label: 'Recent Revenue', value: fmtMoney(metrics.recentRevenue), icon: <CalendarDays size={18} /> },
          ].map((card) => (
            <div key={card.label} className="bg-black/80 rounded-xl p-4 border border-nano-border">
              <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-widest text-nano-text font-bold">
                <span>{card.label}</span>
                {card.icon}
              </div>
              <div className="text-2xl font-bold font-mono text-white">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <div className="text-xs uppercase tracking-widest text-nano-text font-bold">Recent Webhook Events</div>
          <div className="grid gap-3 lg:grid-cols-3">
            {recentWebhookEvents.length === 0 ? (
              <div className="bg-black/80 rounded-xl p-4 border border-nano-border text-sm text-gray-400">No webhook events available.</div>
            ) : (
              recentWebhookEvents.map((item) => (
                <div key={item.id} className="bg-black/80 rounded-xl p-4 border border-nano-border">
                  <div className="text-xs uppercase tracking-widest text-nano-text mb-2">{item.event_type || 'Unknown event'}</div>
                  <div className="text-sm text-white mb-1">{item.processing_status || 'Unknown status'}</div>
                  <div className="text-[11px] text-gray-500">{item.created_at ? new Date(item.created_at).toLocaleString() : 'No timestamp'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between mb-5">
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-nano-yellow">
              <Sparkles size={18} />
              <h3 className="text-sm font-bold uppercase tracking-widest">Recent Activity</h3>
            </div>
            <p className="text-xs text-nano-text max-w-2xl">
              Safe operational activity from orders, applications, payouts, and webhook events.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="bg-black/80 rounded-xl p-4 border border-nano-border">
            <div className="mb-3 text-xs uppercase tracking-widest text-nano-text font-bold">Recent Orders</div>
            {recentOrders.length === 0 ? (
              <div className="text-sm text-gray-500">No recent orders could be loaded.</div>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-nano-border/60 p-3 bg-black/60">
                    <div className="text-sm font-semibold text-white">{order.order_number || order.id.slice(0, 10)}</div>
                    <div className="text-xs text-nano-text">{order.payment_status || 'Unknown status'}</div>
                    <div className="text-xs text-gray-500">{order.total_amount != null ? fmtMoney(order.total_amount) : '--'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-black/80 rounded-xl p-4 border border-nano-border">
            <div className="mb-3 text-xs uppercase tracking-widest text-nano-text font-bold">Recent Applications</div>
            {recentApplications.length === 0 ? (
              <div className="text-sm text-gray-500">No affiliate applications available.</div>
            ) : (
              <div className="space-y-3">
                {recentApplications.map((app) => (
                  <div key={app.id} className="rounded-lg border border-nano-border/60 p-3 bg-black/60">
                    <div className="text-sm font-semibold text-white">{app.email || app.id.slice(0, 8)}</div>
                    <div className="text-xs text-nano-text">{app.status || 'No status'}</div>
                    <div className="text-xs text-gray-500">{app.created_at ? new Date(app.created_at).toLocaleString() : 'Unknown'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-black/80 rounded-xl p-4 border border-nano-border">
            <div className="mb-3 text-xs uppercase tracking-widest text-nano-text font-bold">Recent Payout Batches</div>
            {recentBatches.length === 0 ? (
              <div className="text-sm text-gray-500">No payout batches available.</div>
            ) : (
              <div className="space-y-3">
                {recentBatches.map((batch) => (
                  <div key={batch.id} className="rounded-lg border border-nano-border/60 p-3 bg-black/60">
                    <div className="text-sm font-semibold text-white">Batch {batch.id.slice(0, 8)}</div>
                    <div className="text-xs text-nano-text">{batch.status || 'Unknown status'}</div>
                    <div className="text-xs text-gray-500">{batch.total_amount_cents != null ? fmtMoney(batch.total_amount_cents / 100) : '--'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-black/80 rounded-xl p-4 border border-nano-border">
            <div className="mb-3 text-xs uppercase tracking-widest text-nano-text font-bold">Recent Webhook Events</div>
            {recentWebhookEvents.length === 0 ? (
              <div className="text-sm text-gray-500">No webhook activity available.</div>
            ) : (
              <div className="space-y-3">
                {recentWebhookEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-nano-border/60 p-3 bg-black/60">
                    <div className="text-sm font-semibold text-white">{event.event_type || 'Unknown event'}</div>
                    <div className="text-xs text-nano-text">{event.processing_status || 'No status'}</div>
                    <div className="text-xs text-gray-500">{event.created_at ? new Date(event.created_at).toLocaleString() : 'Unknown'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm font-mono">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-nano-border bg-black/70 p-6 text-center text-sm text-nano-text">
          <Loader2 size={18} className="animate-spin mx-auto mb-3" /> Loading operations overview...
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
