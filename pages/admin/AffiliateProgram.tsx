import React from 'react';
import { Banknote, CreditCard, FileText, ShieldAlert } from 'lucide-react';

const panelClass = 'rounded-lg border border-nano-border bg-black p-5';

const AffiliateProgramAdmin: React.FC = () => {
  const overview = [
    ['Default commission rate', '30%'],
    ['Commission duration', '12 months'],
    ['Attribution window', '60 days'],
    ['Payout hold period', '30 days'],
    ['Minimum payout', '$50'],
    ['Attribution model', 'last-click'],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-mono tracking-wide">Affiliate Program</h2>
        <p className="mt-1 text-sm text-nano-text">Read-only operating terms for the current affiliate program.</p>
      </div>

      <section className={panelClass}>
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-nano-yellow" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-nano-yellow">Program Overview</h3>
        </div>
        <p className="text-sm text-nano-text">
          Cast Director Studio affiliates can earn commissions from eligible referred customer payments during the commission period.
        </p>
        <p className="mt-3 rounded border border-nano-yellow/30 bg-nano-yellow/10 p-3 text-xs text-nano-yellow">
          TODO: Editable global program settings can be added later.
        </p>
      </section>

      <section className={panelClass}>
        <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-nano-yellow">Default Commission Terms</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.map(([label, value]) => (
            <div key={label} className="rounded border border-nano-border bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-widest text-nano-text">{label}</div>
              <div className="mt-1 font-mono text-lg font-bold text-white">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={panelClass}>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-nano-yellow">Attribution Rules</h3>
          <ul className="space-y-2 text-sm text-nano-text">
            <li>Attribution model: last-click.</li>
            <li>Attribution window: 60 days.</li>
            <li>No commission on failed payments or self-referrals.</li>
          </ul>
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex items-center gap-2">
            <Banknote size={17} className="text-nano-yellow" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-nano-yellow">Payout Rules</h3>
          </div>
          <ul className="space-y-2 text-sm text-nano-text">
            <li>Payout hold period: 30 days.</li>
            <li>Minimum payout: $50.</li>
            <li>No commission on taxes.</li>
          </ul>
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert size={17} className="text-nano-yellow" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-nano-yellow">Refunds / Reversals / Chargebacks</h3>
          </div>
          <p className="text-sm text-nano-text">
            No commission on refunded payments, chargebacks, or disputes. Refunds, disputes, chargebacks, and reversals may reduce future payable commissions.
          </p>
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex items-center gap-2">
            <CreditCard size={17} className="text-nano-yellow" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-nano-yellow">Direct Deposit through Stripe</h3>
          </div>
          <p className="text-sm text-nano-text">
            Direct deposit is handled securely through Stripe. Cast Director Studio does not store bank account details.
          </p>
        </section>
      </div>

      <section className={panelClass}>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-nano-yellow">Prohibited Promotion Rules</h3>
        <p className="text-sm text-nano-text">
          Affiliates may not use deceptive promotion, impersonation, spam, unauthorized paid search bidding, self-referrals, or misleading claims about Cast Director Studio.
        </p>
      </section>

      <section className={panelClass}>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-nano-yellow">Support Contact</h3>
        <p className="text-sm text-nano-text">
          Program support: <span className="font-mono text-nano-yellow">support@castdirectorstudio.com</span>
        </p>
      </section>
    </div>
  );
};

export default AffiliateProgramAdmin;
