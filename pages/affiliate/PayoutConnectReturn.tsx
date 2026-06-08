import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PayoutConnectReturnProps {
  session: Session;
  mode: 'return' | 'refresh';
}

const PayoutConnectReturn: React.FC<PayoutConnectReturnProps> = ({ mode }) => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Refreshing Stripe payout account status...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const syncStatus = async () => {
      try {
        const { data, error: syncErr } = await supabase.functions.invoke('sync-affiliate-connect-account', {
          body: {},
        });
        if (syncErr) throw new Error(syncErr.message);
        if (cancelled) return;
        setMessage(data?.reset
          ? 'Your previous Stripe direct deposit setup was removed. Please set it up again.'
          : mode === 'refresh' ? 'Setup session refreshed.' : 'Stripe payout account status updated.');
        window.setTimeout(() => {
          if (!cancelled) navigate('/affiliate', { replace: true });
        }, 1200);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Unable to refresh Stripe payout account status.');
      }
    };

    syncStatus();
    return () => { cancelled = true; };
  }, [mode, navigate]);

  return (
    <section className="py-20 border-t border-nano-border bg-black/20 min-h-[60vh]">
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="rounded-sm border border-nano-border bg-black/40 p-8 text-center">
          {error ? (
            <>
              <ShieldAlert size={28} className="mx-auto mb-4 text-red-400" />
              <h2 className="text-2xl font-bold mb-2">Payout Setup Needs Attention</h2>
              <p className="text-sm text-red-400 font-mono">{error}</p>
              <button
                type="button"
                onClick={() => navigate('/affiliate', { replace: true })}
                className="mt-6 rounded-sm border border-nano-yellow/30 bg-nano-yellow/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow hover:bg-nano-yellow/20"
              >
                Back to Affiliate Dashboard
              </button>
            </>
          ) : (
            <>
              {mode === 'refresh' ? (
                <RefreshCw size={28} className="mx-auto mb-4 text-nano-yellow animate-spin" />
              ) : (
                <Loader2 size={28} className="mx-auto mb-4 text-nano-yellow animate-spin" />
              )}
              <h2 className="text-2xl font-bold mb-2">Set up direct deposit through Stripe</h2>
              <p className="text-sm text-nano-text">{message}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default PayoutConnectReturn;
