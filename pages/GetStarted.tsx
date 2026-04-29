import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight, UserPlus, LogIn, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../App';

/**
 * GetStarted — Post-purchase onboarding page.
 *
 * Stripe redirects here after successful guest checkout.
 * The page guides the buyer to create an account or sign in
 * so their purchase can be linked via claim-purchases.
 *
 * Does NOT grant entitlements. Display only + claim trigger.
 */
const GetStarted: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, openCreateAccount, openSignIn } = useAuth();

  const sessionId = searchParams.get('session_id');
  const type = searchParams.get('type') || 'byok';

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimComplete, setClaimComplete] = useState(false);
  const [claimResult, setClaimResult] = useState<any>(null);
  const [pollCount, setPollCount] = useState(0);
  const [isFulfilled, setIsFulfilled] = useState(false);

  // When the user authenticates, trigger claim-purchases and then poll for fulfillment
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    const claimAndPoll = async () => {
      // 1. Invoke claim-purchases to link pending records
      setIsClaiming(true);
      try {
        const { data, error } = await supabase.functions.invoke('claim-purchases', {
          body: {},
        });
        if (!error && data) {
          setClaimResult(data);
        }
      } catch (err) {
        console.error('claim-purchases failed:', err);
      }
      if (cancelled) return;
      setIsClaiming(false);
      setClaimComplete(true);

      // 2. Poll for fulfillment (same pattern as Success.tsx)
      let polls = 0;
      const MAX_POLLS = 12;
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const checkFulfillment = async () => {
        if (cancelled) return;
        polls++;
        setPollCount(polls);

        try {
          const { data: latestOrder } = await supabase
            .from('orders')
            .select('id, fulfillment_status, created_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!latestOrder) return;

          const isRecent = (Date.now() - new Date(latestOrder.created_at).getTime()) < 15 * 60 * 1000;
          if (!isRecent) return;
          if (latestOrder.fulfillment_status !== 'fulfilled') return;

          // Check for asset availability
          let assetReady = false;

          if (type === 'byok') {
            const { count } = await supabase
              .from('licenses')
              .select('id', { count: 'exact', head: true })
              .eq('order_id', latestOrder.id);
            if (count && count > 0) assetReady = true;
          } else if (type === 'hosted') {
            const { count } = await supabase
              .from('subscriptions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', session.user.id)
              .gte('created_at', fifteenMinsAgo);
            if (count && count > 0) assetReady = true;
          } else {
            // renewal or unknown — check order fulfillment is enough
            assetReady = true;
          }

          if (assetReady) {
            setIsFulfilled(true);
          }
        } catch (err) {
          console.error('Fulfillment polling error:', err);
        }
      };

      // Initial check
      await checkFulfillment();

      // Continue polling
      const interval = setInterval(async () => {
        if (polls >= MAX_POLLS || cancelled) {
          clearInterval(interval);
          if (!cancelled) setIsFulfilled(true); // Unlock after timeout
          return;
        }
        await checkFulfillment();
      }, 2500);

      return () => clearInterval(interval);
    };

    claimAndPoll();

    return () => { cancelled = true; };
  }, [session, type]);

  // Redirect to dashboard once fulfilled
  useEffect(() => {
    if (isFulfilled && session) {
      const timer = setTimeout(() => navigate('/account', { replace: true }), 1500);
      return () => clearTimeout(timer);
    }
  }, [isFulfilled, session, navigate]);

  const getTypeLabel = () => {
    switch (type) {
      case 'hosted': return 'subscription';
      case 'renewal': return 'renewal';
      default: return 'license';
    }
  };

  return (
    <div className="min-h-screen bg-nano-dark flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="max-w-md w-full border border-nano-border bg-nano-panel/40 p-10 rounded-sm relative overflow-hidden">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-nano-yellow to-transparent" />

        {/* ─── State: Authenticated + fulfillment complete ─── */}
        {session && isFulfilled && (
          <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
            <CheckCircle2 size={64} className="text-green-400 mb-6" />
            <h1 className="text-2xl font-bold mb-2">You're All Set</h1>
            <p className="text-sm text-nano-text mb-6">
              Your {getTypeLabel()} has been linked to your account. Redirecting to your dashboard…
            </p>
            <Loader2 size={20} className="animate-spin text-nano-yellow" />
          </div>
        )}

        {/* ─── State: Authenticated + claiming/polling ─── */}
        {session && !isFulfilled && (
          <div className="flex flex-col items-center justify-center py-4">
            <Loader2 size={48} className="animate-spin text-nano-yellow mb-6" />
            <h1 className="text-2xl font-bold mb-2">
              {isClaiming ? 'Linking Your Purchase…' : 'Verifying Fulfillment…'}
            </h1>
            <p className="text-sm text-nano-text">
              {isClaiming
                ? 'Connecting your purchase to your account.'
                : 'Confirming your purchase has been provisioned. This usually takes a few seconds.'}
            </p>
          </div>
        )}

        {/* ─── State: Not authenticated (main onboarding) ─── */}
        {!session && (
          <div className="flex flex-col items-center">
            <CheckCircle2 size={56} className="text-green-400 mb-6" />

            <h1 className="text-2xl font-bold mb-3">Purchase Complete</h1>

            <p className="text-[15px] text-nano-text leading-relaxed mb-8">
              Create your Cast Director Studio account or sign in to access your {getTypeLabel()}, credits, and download details.
            </p>

            {/* Email match instruction */}
            <div className="w-full bg-nano-yellow/[0.06] border border-nano-yellow/20 rounded-lg p-4 mb-8 flex items-start gap-3 text-left">
              <Mail size={18} className="text-nano-yellow shrink-0 mt-0.5" />
              <p className="text-[13px] text-slate-300 leading-relaxed">
                <span className="text-white font-semibold">Use the same email address</span> you used at checkout so we can connect your purchase automatically.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={openCreateAccount}
                className="w-full py-4 px-6 bg-nano-yellow text-black font-bold uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-[#eab308] hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] transition-all"
              >
                <UserPlus size={18} />
                Create Account
              </button>

              <button
                type="button"
                onClick={openSignIn}
                className="w-full py-4 px-6 bg-white/10 text-white font-bold uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-white/20 transition-all border border-white/10"
              >
                <LogIn size={18} />
                Sign In
              </button>
            </div>

            {/* Support fallback */}
            <p className="mt-8 text-[12px] text-slate-500 leading-relaxed">
              Already purchased but don't see access?{' '}
              <a
                href="mailto:support@castdirectorstudio.com"
                className="text-nano-yellow/70 hover:text-nano-yellow transition-colors"
              >
                Contact support@castdirectorstudio.com
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GetStarted;
