import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthPanelProps {
    initialMode?: 'signin' | 'signup';
    session: Session | null;
    onClose?: () => void;
}

const AuthPanel: React.FC<AuthPanelProps> = ({
    initialMode = 'signup',
    session,
    onClose,
}) => {
    const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMode(initialMode);
        setMessage(null);
    }, [initialMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (mode === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (error) throw error;

                setMessage('Account created. Check your email if confirmation is enabled.');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                setMessage('Signed in successfully.');
                onClose?.();
            }
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Authentication failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setMessage('Signed out.');
    };

    if (session) {
        return (
            <div className="rounded-sm border border-nano-border bg-nano-panel p-6 shadow-2xl">
                <h3 className="text-2xl font-bold mb-2">You’re signed in</h3>
                <p className="text-nano-text mb-6">{session.user.email}</p>

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="px-5 py-3 border border-nano-border text-white uppercase tracking-wide hover:bg-white/10 transition-colors"
                    >
                        Sign Out
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-3 bg-nano-yellow text-black font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-sm border border-nano-border bg-nano-panel p-6 shadow-2xl">
            <h3 className="text-2xl font-bold mb-2">
                {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </h3>

            <p className="text-sm text-nano-text mb-5">
                {mode === 'signup' ? (
                    <>
                        Already have an account?{' '}
                        <button
                            type="button"
                            onClick={() => {
                                setMode('signin');
                                setMessage(null);
                            }}
                            className="text-nano-yellow hover:underline"
                        >
                            Sign In
                        </button>
                    </>
                ) : (
                    <>
                        Need an account?{' '}
                        <button
                            type="button"
                            onClick={() => {
                                setMode('signup');
                                setMessage(null);
                            }}
                            className="text-nano-yellow hover:underline"
                        >
                            Create Account
                        </button>
                    </>
                )}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-black/30 border border-nano-border text-white outline-none"
                    required
                />

                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-black/30 border border-nano-border text-white outline-none"
                    required
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-nano-yellow text-black font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors disabled:opacity-70"
                >
                    {loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
            </form>

            {message && (
                <div className={`mt-4 p-3 rounded text-sm text-center ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('invalid') ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-nano-yellow/10 text-nano-yellow border border-nano-yellow/30'}`}>
                    {message}
                </div>
            )}
        </div>
    );
};

export default AuthPanel;