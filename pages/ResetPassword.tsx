import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../App';

const ResetPassword = () => {
    const navigate = useNavigate();
    const { session } = useAuth();
    
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [urlError, setUrlError] = useState<string | null>(null);
    const [isSessionChecked, setIsSessionChecked] = useState(false);

    useEffect(() => {
        const processUrl = async () => {
            // Check for error in hash (e.g. expired link that went through GoTrue)
            if (window.location.hash) {
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                const errorCode = hashParams.get('error_code');
                if (errorCode === 'otp_expired') {
                    setUrlError('otp_expired');
                    setIsSessionChecked(true);
                    return;
                }
            }

            const searchParams = new URLSearchParams(window.location.search);

            // Flow 1: Direct OTP link from admin emails
            // URL: /reset-password?token=OTP&email=EMAIL&type=recovery
            const otpToken = searchParams.get('token');
            const otpEmail = searchParams.get('email');
            const otpType = searchParams.get('type');

            if (otpToken && otpEmail && otpType === 'recovery') {
                try {
                    const { error } = await supabase.auth.verifyOtp({
                        email: otpEmail,
                        token: otpToken,
                        type: 'recovery',
                    });
                    if (error) throw error;
                    // Clean URL to remove token
                    window.history.replaceState({}, document.title, window.location.pathname);
                } catch (e: any) {
                    console.error("OTP verification failed:", e);
                    if (e.message?.includes('expired')) {
                        setUrlError('otp_expired');
                    } else {
                        setUrlError('exchange_failed');
                    }
                } finally {
                    setIsSessionChecked(true);
                }
                return;
            }

            // Flow 2: PKCE code exchange
            // URL: /reset-password?code=CODE
            const code = searchParams.get('code');
            if (code) {
                try {
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) throw error;
                    window.history.replaceState({}, document.title, window.location.pathname);
                } catch (e: any) {
                    console.error("Exchange code failed:", e);
                    setUrlError('exchange_failed');
                } finally {
                    setIsSessionChecked(true);
                }
                return;
            }

            // Flow 3: Implicit hash flow (Supabase auto-processes #access_token=...)
            // Wait briefly for Supabase JS to pick up the hash fragment
            setTimeout(() => {
                setIsSessionChecked(true);
            }, 1500);
        };

        processUrl();
    }, []);

    // Also consider it checked if we immediately get a session
    useEffect(() => {
        if (session) {
            setIsSessionChecked(true);
        }
    }, [session]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (updateError) throw updateError;

            setSuccess(true);
            setTimeout(() => {
                navigate('/account', { replace: true });
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to update password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-nano-dark flex flex-col items-center justify-center p-6 text-white">
            <div className="max-w-md w-full border border-nano-border bg-nano-panel/40 p-8 rounded-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-nano-yellow to-transparent" />

                <h1 className="text-2xl font-bold mb-6 text-center">Reset Password</h1>

                {!isSessionChecked ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <Loader2 size={32} className="animate-spin text-nano-yellow mb-4" />
                        <p className="text-nano-text text-sm">Verifying reset link...</p>
                    </div>
                ) : (!session || urlError) ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                        <XCircle size={48} className="text-red-400 mb-4" />
                        <p className="text-nano-text mb-6">
                            This password reset link is invalid or expired. Please request a new password reset email.
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="px-6 py-3 bg-white/10 text-white font-bold uppercase tracking-wide hover:bg-white/20 transition-all border border-white/10"
                        >
                            Request New Reset Link
                        </button>
                    </div>
                ) : success ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                        <CheckCircle2 size={48} className="text-green-400 mb-4" />
                        <p className="text-nano-text mb-4">
                            Password updated successfully.
                        </p>
                        <p className="text-sm text-nano-text opacity-70">
                            Redirecting to your account...
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs text-nano-text uppercase tracking-wide">New Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-black/30 border border-nano-border text-white outline-none"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-nano-text uppercase tracking-wide">Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-black/30 border border-nano-border text-white outline-none"
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-3 border border-red-500/50 bg-red-900/20 text-red-200 text-sm rounded-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 mt-4 bg-nano-yellow text-black font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 size={16} className="animate-spin" />}
                            Update Password
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPassword;
