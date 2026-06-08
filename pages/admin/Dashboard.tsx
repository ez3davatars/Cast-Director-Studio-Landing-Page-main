import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Loader2, UserCheck, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface AffiliateDashboardMetrics {
  totalAffiliates: number;
  activeAffiliates: number;
  pendingAffiliates: number;
  suspendedAffiliates: number;
  totalClicks: number;
  totalReferrals: number;
  commissionsInHoldCents: number;
  payableCommissionsCents: number;
  paidCommissionsCents: number;
  pendingPayoutBatches: number;
}

const emptyMetrics: AffiliateDashboardMetrics = {
  totalAffiliates: 0,
  activeAffiliates: 0,
  pendingAffiliates: 0,
  suspendedAffiliates: 0,
  totalClicks: 0,
  totalReferrals: 0,
  commissionsInHoldCents: 0,
  payableCommissionsCents: 0,
  paidCommissionsCents: 0,
  pendingPayoutBatches: 0,
};

const metricClass = 'bg-black border border-nano-border rounded-lg p-4';

const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<AffiliateDashboardMetrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAffiliateMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const now = new Date().toISOString();

      const [
        affiliatesRes,
        clicksRes,
        referralsRes,
        ledgerRes,
        paidItemsRes,
        pendingBatchesRes,
      ] = await Promise.all([
        supabase.from('affiliates').select('status'),
        supabase.from('affiliate_clicks').select('id', { count: 'exact', head: true }),
        supabase.from('referrals').select('id', { count: 'exact', head: true }),
        supabase
          .from('commission_ledger')
          .select('type, amount_cents, hold_until, payout_batch_id')
          .is('payout_batch_id', null),
        supabase.from('payout_items').select('amount_cents').eq('status', 'paid'),
        supabase.from('payout_batches').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      ]);

      if (affiliatesRes.error) throw affiliatesRes.error;
      if (clicksRes.error) throw clicksRes.error;
      if (referralsRes.error) throw referralsRes.error;
      if (ledgerRes.error) throw ledgerRes.error;
      if (paidItemsRes.error) throw paidItemsRes.error;
      if (pendingBatchesRes.error) throw pendingBatchesRes.error;

      const affiliates = affiliatesRes.data || [];
      const ledgerRows = ledgerRes.data || [];

      let commissionsInHoldCents = 0;
      let payableCommissionsCents = 0;

      for (const row of ledgerRows) {
        const signedAmount = row.type === 'earned' ? row.amount_cents : -row.amount_cents;
        if (row.hold_until && row.hold_until > now) {
          commissionsInHoldCents += signedAmount;
        } else {
          payableCommissionsCents += signedAmount;
        }
      }

      const paidCommissionsCents = (paidItemsRes.data || []).reduce(
        (sum, row) => sum + (row.amount_cents || 0),
        0
      );

      setMetrics({
        totalAffiliates: affiliates.length,
        activeAffiliates: affiliates.filter(row => row.status === 'active').length,
        pendingAffiliates: affiliates.filter(row => row.status === 'pending').length,
        suspendedAffiliates: affiliates.filter(row => row.status === 'suspended').length,
        totalClicks: clicksRes.count || 0,
        totalReferrals: referralsRes.count || 0,
        commissionsInHoldCents: Math.max(0, commissionsInHoldCents),
        payableCommissionsCents: Math.max(0, payableCommissionsCents),
        paidCommissionsCents,
        pendingPayoutBatches: pendingBatchesRes.count || 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load affiliate program metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAffiliateMetrics(); }, [loadAffiliateMetrics]);

  const metricCards = [
    ['Total Affiliates', metrics.totalAffiliates],
    ['Active Affiliates', metrics.activeAffiliates],
    ['Pending Affiliates', metrics.pendingAffiliates],
    ['Suspended Affiliates', metrics.suspendedAffiliates],
    ['Total Affiliate Clicks', metrics.totalClicks],
    ['Conversions / Referrals', metrics.totalReferrals],
    ['Commissions In Hold', fmtMoney(metrics.commissionsInHoldCents)],
    ['Payable Commissions', fmtMoney(metrics.payableCommissionsCents)],
    ['Paid Commissions', fmtMoney(metrics.paidCommissionsCents)],
    ['Pending Payout Batches', metrics.pendingPayoutBatches],
  ];

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-6">
          <h2 className="text-2xl font-bold font-mono tracking-wide">Operations Overview</h2>
          <p className="text-sm text-nano-text mt-1">Monitor commerce, customer operations, and affiliate program health.</p>
        </div>
      </section>

      <section className="bg-black/40 border border-nano-border rounded-lg p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 text-nano-yellow">
              <UserCheck size={18} />
              <h3 className="text-sm font-bold uppercase tracking-widest">Affiliate Program</h3>
            </div>
            <p className="text-xs text-nano-text mt-1">
              Aggregate affiliate activity and payout status. Click data is shown only as counts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/affiliates"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded border border-nano-yellow/30 bg-nano-yellow/10 text-nano-yellow hover:bg-nano-yellow/20 transition-colors"
            >
              <Users size={14} /> Manage Affiliates
            </Link>
            <Link
              to="/admin/payouts"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded border border-green-400/30 bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors"
            >
              <Banknote size={14} /> Manage Payouts
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {[...Array(10)].map((_, index) => (
              <div key={index} className="h-24 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/40 text-red-400 p-4 rounded font-mono text-sm">
            {error}
          </div>
        ) : metrics.totalAffiliates === 0 ? (
          <div className="bg-black border border-nano-border rounded-lg p-8 text-center">
            <UserCheck size={28} className="text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 italic">No affiliate records found yet.</p>
            <div className="mt-4">
              <Link
                to="/admin/affiliates"
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded border border-nano-yellow/30 bg-nano-yellow/10 text-nano-yellow hover:bg-nano-yellow/20 transition-colors"
              >
                <Users size={14} /> Manage Affiliates
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {metricCards.map(([label, value]) => (
              <div key={label} className={metricClass}>
                <div className="text-[10px] uppercase tracking-widest text-nano-text mb-2">{label}</div>
                <div className="text-2xl font-bold font-mono text-white">{value}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminDashboard;
