import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

import { supabase } from '../lib/supabase';

const Success = () => {
    const { type } = useParams();
    const [isFulfilling, setIsFulfilling] = useState(true);
    const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

    // Active Database Polling for Fulfillment State
    useEffect(() => {
        let isActive = true;
        let pollCount = 0;
        const MAX_POLLS = 10; // ~25 seconds timeout

        const checkFulfillment = async () => {
            if (!isActive) return;

            try {
                // 1. Authoritative Auth Check
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user) return;
                const user = session.user;

                // 2. Fetch the most recent order for the user
                const { data: latestOrder } = await supabase
                    .from('orders')
                    .select('id, fulfillment_status, created_at')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (!isActive || !latestOrder) return;

                // 3. Ensure order is recent (created within the last 15 minutes)
                const isRecent = (Date.now() - new Date(latestOrder.created_at).getTime()) < 15 * 60 * 1000;
                if (!isRecent) return;

                // 4. Baseline condition: Order MUST be fulfilled
                if (latestOrder.fulfillment_status !== 'fulfilled') return;

                // 5. Type-Specific Asset Availability Checks
                let isAssetReady = false;
                const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

                if (type === 'byok') {
                    // Require strict mapping from the specific order_id to a created license
                    const { count, error } = await supabase
                        .from('licenses')
                        .select('id', { count: 'exact', head: true })
                        .eq('order_id', latestOrder.id);
                    if (!error && count && count > 0) isAssetReady = true;

                } else if (type === 'hosted') {
                    // Require a recently created subscription for this user
                    const { count, error } = await supabase
                        .from('subscriptions')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', user.id)
                        .gte('created_at', fifteenMinsAgo);
                    if (!error && count && count > 0) isAssetReady = true;

                } else if (type === 'renewal') {
                    // Require an updated_at bump on an existing license
                    const { count, error } = await supabase
                        .from('licenses')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', user.id)
                        .gte('updated_at', fifteenMinsAgo);
                    if (!error && count && count > 0) isAssetReady = true;
                }

                // Unmount condition
                if (isAssetReady) {
                    setIsFulfilling(false);
                }

            } catch (err) {
                console.error("Polling integrity failure:", err);
            }
        };

        const interval = setInterval(() => {
            pollCount++;
            if (pollCount >= MAX_POLLS) {
                // Time threshold exceeded; unlock UI with fallback message
                setFallbackMessage("Fulfillment is taking slightly longer than expected... Your payment was successful. We will continue processing in the background.");
                setIsFulfilling(false); 
            } else {
                checkFulfillment();
            }
        }, 2500);

        // Run immediately to catch instant-fulfillments
        checkFulfillment();

        return () => {
            isActive = false;
            clearInterval(interval);
        };
    }, [type]);

    const getTypeDetails = () => {
        switch (type) {
            case 'hosted':
                return {
                    title: "Welcome to Cast Director Studio",
                    subtitle: "Your hosted subscription is active.",
                    perks: ["Cloud generation credits deposited", "Studio access unlocked", "Premium support enabled"]
                };
            case 'renewal':
                return {
                    title: "Subscription Renewed",
                    subtitle: "Thank you for continuing with us.",
                    perks: ["Account validity extended", "New credits deposited", "Support tier refreshed"]
                };
            case 'byok':
            default:
                return {
                    title: "License Acquired",
                    subtitle: "Thank you for your purchase.",
                    perks: ["Perpetual fallback license granted", "Installer download ready", "API Key access unlocked"]
                };
        }
    };

    const details = getTypeDetails();

    return (
        <div className="min-h-screen bg-nano-dark flex flex-col items-center justify-center p-6 text-white text-center">
            
            <div className="max-w-md w-full border border-nano-border bg-nano-panel/40 p-10 rounded-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-nano-yellow to-transparent"></div>
                
                {isFulfilling ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <Loader2 size={48} className="animate-spin text-nano-yellow mb-6" />
                        <h1 className="text-2xl font-bold mb-2">Processing Payment...</h1>
                        <p className="text-sm text-nano-text">
                            We are securing your transaction and provisioning your digital goods.
                            Please do not close this page.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                        <CheckCircle2 size={64} className="text-green-400 mb-6" />
                        <h1 className="text-2xl font-bold mb-2">{details.title}</h1>
                        <p className="text-sm text-nano-text mb-8">
                            {details.subtitle}
                        </p>

                        {fallbackMessage && (
                            <div className="w-full bg-nano-yellow/10 border border-nano-yellow/40 text-left p-4 mb-6 rounded-sm text-sm text-nano-text leading-relaxed">
                                {fallbackMessage}
                            </div>
                        )}

                        <div className="w-full bg-black/40 border border-nano-border text-left p-6 mb-8">
                            <h3 className="text-xs uppercase tracking-widest text-nano-text mb-4 border-b border-nano-border/50 pb-2">
                                Provisionary Status
                            </h3>
                            <ul className="space-y-3">
                                {details.perks.map((perk, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm text-gray-300">
                                        <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                                        <span>{perk}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <Link 
                            to="/account" 
                            className="inline-flex items-center justify-center gap-2 w-full py-4 px-6 bg-nano-yellow text-black font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors"
                        >
                            <span>Open Dashboard</span>
                            <ArrowRight size={18} />
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Success;
