import React, { useEffect, useState } from 'react';
import { Banknote, CreditCard, FileText, Loader2, Save, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminFeedback } from '../../components/AdminFeedback';

const panelClass = 'rounded-lg border border-nano-border bg-black p-5';

interface ProgramSettings {
  id: string;
  commission_rate: number;
  commission_duration_months: number;
  attribution_window_days: number;
  payout_hold_days: number;
  minimum_payout_cents: number;
  attribution_model: string;
  support_email: string;
  updated_at: string | null;
}

const defaults: ProgramSettings = {
  id: 'default',
  commission_rate: 0.30,
  commission_duration_months: 12,
  attribution_window_days: 60,
  payout_hold_days: 30,
  minimum_payout_cents: 5000,
  attribution_model: 'last-click',
  support_email: 'support@castdirectorstudio.com',
  updated_at: null,
};

const AffiliateProgramAdmin: React.FC = () => {
  const [settings, setSettings] = useState<ProgramSettings>(defaults);
  const [form, setForm] = useState<ProgramSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useAdminFeedback();

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await supabase
          .from('affiliate_program_settings')
          .select('*')
          .eq('id', 'default')
          .single();
        if (fetchErr) throw fetchErr;
        const next = { ...defaults, ...(data || {}) };
        setSettings(next);
        setForm(next);
      } catch (err: any) {
        setError(err.message || 'Failed to load affiliate program settings.');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const setField = (key: keyof ProgramSettings, value: string) => {
    const numericFields = new Set<keyof ProgramSettings>([
      'commission_rate',
      'commission_duration_months',
      'attribution_window_days',
      'payout_hold_days',
      'minimum_payout_cents',
    ]);
    setForm(prev => ({
      ...prev,
      [key]: numericFields.has(key) ? Number(value) : value,
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        commission_rate: form.commission_rate,
        commission_duration_months: form.commission_duration_months,
        attribution_window_days: form.attribution_window_days,
        payout_hold_days: form.payout_hold_days,
        minimum_payout_cents: Math.round(form.minimum_payout_cents),
        attribution_model: form.attribution_model.trim() || 'last-click',
        support_email: form.support_email.trim() || defaults.support_email,
        updated_by: userData.user?.id || null,
      };

      const { data, error: updateErr } = await supabase
        .from('affiliate_program_settings')
        .update(payload)
        .eq('id', 'default')
        .select('*')
        .single();
      if (updateErr) throw updateErr;

      const next = { ...defaults, ...(data || {}) };
      setSettings(next);
      setForm(next);
      notify('Affiliate program settings saved.', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
      notify(`Settings save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const overview = [
    ['Default commission rate', `${(Number(settings.commission_rate) * 100).toFixed(0)}%`],
    ['Commission duration', `${settings.commission_duration_months} months`],
    ['Attribution window', `${settings.attribution_window_days} days`],
    ['Payout hold period', `${settings.payout_hold_days} days`],
    ['Minimum payout', `$${(settings.minimum_payout_cents / 100).toFixed(0)}`],
    ['Attribution model', settings.attribution_model],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="font-mono text-2xl font-bold tracking-wide">Affiliate Program</h2>
          <p className="mt-1 text-sm text-nano-text">Default operating terms used when creating and reviewing affiliates.</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded border border-nano-yellow/30 bg-nano-yellow/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow hover:bg-nano-yellow/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      )}

      <section className={panelClass}>
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-nano-yellow" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-nano-yellow">Program Overview</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.map(([label, value]) => (
            <div key={label} className="rounded border border-nano-border bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-widest text-nano-text">{label}</div>
              <div className="mt-1 font-mono text-lg font-bold text-white">{value}</div>
            </div>
          ))}
        </div>
        {settings.updated_at && (
          <p className="mt-4 text-xs text-nano-text">Last updated {new Date(settings.updated_at).toLocaleString()}</p>
        )}
      </section>

      <section className={panelClass}>
        <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-nano-yellow">Editable Defaults</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ['commission_rate', 'Commission Rate', '0.30', '0.01', '1', '0.01'],
            ['commission_duration_months', 'Commission Duration Months', '12', '1', '120', '1'],
            ['attribution_window_days', 'Attribution Window Days', '60', '1', '365', '1'],
            ['payout_hold_days', 'Payout Hold Days', '30', '0', '365', '1'],
            ['minimum_payout_cents', 'Minimum Payout Cents', '5000', '0', '100000', '100'],
          ].map(([key, label, placeholder, min, max, step]) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-gray-500">{label}</span>
              <input
                type="number"
                value={(form as any)[key]}
                onChange={e => setField(key as keyof ProgramSettings, e.target.value)}
                placeholder={placeholder}
                min={min}
                max={max}
                step={step}
                className="w-full rounded border border-nano-border bg-black px-3 py-2 font-mono text-sm text-white focus:border-nano-yellow focus:outline-none"
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-gray-500">Attribution Model</span>
            <input
              value={form.attribution_model}
              onChange={e => setField('attribution_model', e.target.value)}
              className="w-full rounded border border-nano-border bg-black px-3 py-2 font-mono text-sm text-white focus:border-nano-yellow focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-gray-500">Support Email</span>
            <input
              type="email"
              value={form.support_email}
              onChange={e => setField('support_email', e.target.value)}
              className="w-full rounded border border-nano-border bg-black px-3 py-2 font-mono text-sm text-white focus:border-nano-yellow focus:outline-none"
            />
          </label>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={panelClass}>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-nano-yellow">Attribution Rules</h3>
          <ul className="space-y-2 text-sm text-nano-text">
            <li>Attribution model: {settings.attribution_model}.</li>
            <li>Attribution window: {settings.attribution_window_days} days.</li>
            <li>No commission on failed payments or self-referrals.</li>
          </ul>
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex items-center gap-2">
            <Banknote size={17} className="text-nano-yellow" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-nano-yellow">Payout Rules</h3>
          </div>
          <ul className="space-y-2 text-sm text-nano-text">
            <li>Payout hold period: {settings.payout_hold_days} days.</li>
            <li>Minimum payout: ${(settings.minimum_payout_cents / 100).toFixed(2)}.</li>
            <li>No commission on taxes.</li>
          </ul>
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert size={17} className="text-nano-yellow" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-nano-yellow">Refunds / Reversals / Chargebacks</h3>
          </div>
          <p className="text-sm text-nano-text">
            Refunds, disputes, chargebacks, and reversals reduce future payable commissions through ledger reversal rows.
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
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-nano-yellow">Support Contact</h3>
        <p className="text-sm text-nano-text">
          Program support: <span className="font-mono text-nano-yellow">{settings.support_email}</span>
        </p>
      </section>
    </div>
  );
};

export default AffiliateProgramAdmin;
