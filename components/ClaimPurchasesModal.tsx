import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { X, Loader2, Link as LinkIcon, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ClaimPurchasesModalProps {
    session: Session;
    onClose: () => void;
    onSuccess: () => void;
}

const ClaimPurchasesModal: React.FC<ClaimPurchasesModalProps> = ({ session, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);

    const [previewCounts, setPreviewCounts] = useState({
        contacts: 0,
        orders: 0,
        licenses: 0,
        downloads: 0,
        subscriptions: 0
    });

    const email = session.user.email;

    useEffect(() => {
        if (!email) {
            setError("No email found in session.");
            setLoading(false);
            return;
        }
        calculatePreview();
    }, [email]);

    const calculatePreview = async () => {
        try {
            setLoading(true);
            let cCount = 0, oCount = 0, lCount = 0, dCount = 0, sCount = 0;
            let stripeCustomerId: string | null = null;
            let orderIds: string[] = [];

            // 1. Contacts
            const contactsRes = await supabase.from('contacts')
                .select('id, stripe_customer_id')
                .eq('email', email)
                .is('user_id', null);
            
            if (contactsRes.data && contactsRes.data.length > 0) {
                cCount = contactsRes.data.length;
                stripeCustomerId = contactsRes.data.find(c => c.stripe_customer_id)?.stripe_customer_id || null;
            }

            // 2. Orders
            const ordersRes = await supabase.from('orders')
                .select('id, stripe_customer_id')
                .eq('customer_email', email)
                .is('user_id', null);
            
            if (ordersRes.data && ordersRes.data.length > 0) {
                oCount = ordersRes.data.length;
                orderIds = ordersRes.data.map((o: any) => o.id);
                if (!stripeCustomerId) {
                    stripeCustomerId = ordersRes.data.find(o => o.stripe_customer_id)?.stripe_customer_id || null;
                }
            }

            // 3 & 4. Licenses and Downloads (relational match via order_id)
            if (orderIds.length > 0) {
                const licRes = await supabase.from('licenses')
                    .select('id', { count: 'exact', head: true })
                    .in('order_id', orderIds)
                    .is('user_id', null);
                lCount = licRes.count || 0;

                const downRes = await supabase.from('downloads')
                    .select('id', { count: 'exact', head: true })
                    .in('order_id', orderIds)
                    .is('user_id', null);
                dCount = downRes.count || 0;
            }

            // 5. Subscriptions (relational match via stripe_customer_id)
            if (stripeCustomerId) {
                const subRes = await supabase.from('subscriptions')
                    .select('id', { count: 'exact', head: true })
                    .eq('stripe_customer_id', stripeCustomerId)
                    .is('user_id', null);
                sCount = subRes.count || 0;
            }

            setPreviewCounts({
                contacts: cCount,
                orders: oCount,
                licenses: lCount,
                downloads: dCount,
                subscriptions: sCount
            });

        } catch (err: any) {
            console.error("Preview generation failed safely:", err);
            // Non-fatal. Display empty states or zeros to be safe.
        } finally {
            setLoading(false);
        }
    };

    const handleClaim = async () => {
        try {
            setClaiming(true);
            setError(null);

            // Execute the secure remote procedure call (bypasses UI manipulation risks)
            const { data, error: rpcError } = await supabase.rpc('claim_guest_purchases');

            if (rpcError) {
                // If the backend doesn't have the RPC installed yet, or fails gracefully
                throw new Error(rpcError.message || "Failed to execute server claim procedure");
            }

            setResult(data);

            // Wait a moment for UX impact, then notify parent
            setTimeout(() => {
                onSuccess();
            }, 3000);

        } catch (err: any) {
            console.error("Claiming transaction failed:", err);
            setError(err.message || "An unexpected error occurred during the linking process.");
        } finally {
            setClaiming(false);
        }
    };

    const totalPreview = previewCounts.orders + previewCounts.licenses + previewCounts.downloads + previewCounts.subscriptions + previewCounts.contacts;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
            <div className="bg-nano-panel border border-nano-border w-full max-w-lg shadow-2xl overflow-hidden text-white flex flex-col relative">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-nano-border flex justify-between items-center bg-black/40">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <LinkIcon size={18} className="text-nano-yellow" />
                        Link Guest Purchases
                    </h3>
                    {!claiming && !result && (
                        <button onClick={onClose} className="text-nano-text hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-nano-text">
                            <Loader2 size={32} className="animate-spin mb-4 text-nano-yellow" />
                            <p>Scanning registry for orphaned purchases...</p>
                        </div>
                    ) : result ? (
                        <div className="py-8 text-center flex flex-col items-center">
                            <CheckCircle2 size={48} className="text-green-400 mb-4" />
                            <h4 className="text-xl font-bold mb-2">Claim Successful!</h4>
                            <p className="text-nano-text text-sm mb-6">
                                We securely linked the following orphaned records to your account. Your dashboard will refresh momentarily.
                            </p>
                            <div className="grid grid-cols-2 gap-4 w-full max-w-sm mx-auto text-left text-sm bg-black/40 p-4 border border-nano-border">
                                <div>Contacts: <strong className="text-nano-yellow">{result.contacts || 0}</strong></div>
                                <div>Orders: <strong className="text-nano-yellow">{result.orders || 0}</strong></div>
                                <div>Licenses: <strong className="text-nano-yellow">{result.licenses || 0}</strong></div>
                                <div>Downloads: <strong className="text-nano-yellow">{result.downloads || 0}</strong></div>
                                <div className="col-span-2">Subscriptions: <strong className="text-nano-yellow">{result.subscriptions || 0}</strong></div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
                                We found records associated with <strong>{email}</strong> that are not currently linked to your active profile. By clicking confirm, you agree to safely merge these records into your account.
                            </p>

                            <div className="bg-black/30 border border-nano-border p-4 mb-6">
                                <h4 className="text-xs uppercase tracking-wide text-nano-text mb-3 font-semibold border-b border-nano-border/50 pb-2">Records to be Claimed</h4>
                                <ul className="space-y-2 text-sm font-mono">
                                    <li className="flex justify-between">
                                        <span className="text-gray-400">Customer Contacts</span>
                                        <span className={previewCounts.contacts > 0 ? 'text-white font-bold' : 'text-nano-text'}>{previewCounts.contacts}</span>
                                    </li>
                                    <li className="flex justify-between">
                                        <span className="text-gray-400">Order Receipts</span>
                                        <span className={previewCounts.orders > 0 ? 'text-white font-bold' : 'text-nano-text'}>{previewCounts.orders}</span>
                                    </li>
                                    <li className="flex justify-between">
                                        <span className="text-gray-400">Software Licenses</span>
                                        <span className={previewCounts.licenses > 0 ? 'text-white font-bold' : 'text-nano-text'}>{previewCounts.licenses}</span>
                                    </li>
                                    <li className="flex justify-between">
                                        <span className="text-gray-400">Digital Downloads</span>
                                        <span className={previewCounts.downloads > 0 ? 'text-white font-bold' : 'text-nano-text'}>{previewCounts.downloads}</span>
                                    </li>
                                    <li className="flex justify-between">
                                        <span className="text-gray-400">Subscriptions</span>
                                        <span className={previewCounts.subscriptions > 0 ? 'text-white font-bold' : 'text-nano-text'}>{previewCounts.subscriptions}</span>
                                    </li>
                                </ul>
                                {totalPreview === 0 && (
                                    <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        <span>No orphaned records found for this email. This might happen if another user already claimed them, or if the initial tracking query misidentified them.</span>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="mb-6 p-3 bg-red-900/30 border border-red-500/50 text-red-200 text-sm flex items-start gap-2">
                                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    disabled={claiming}
                                    className="px-4 py-2 text-sm font-bold text-nano-text hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleClaim}
                                    disabled={claiming || totalPreview === 0}
                                    className="px-6 py-2 bg-nano-yellow text-black text-sm font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {claiming ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Linking...
                                        </>
                                    ) : (
                                        "Confirm Link"
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClaimPurchasesModal;
