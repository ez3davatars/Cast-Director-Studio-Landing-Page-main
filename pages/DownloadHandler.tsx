import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DownloadCloud, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';

const DownloadHandler = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const bootDelivery = async () => {
            if (!id) {
                if (mounted) {
                    setStatus('error');
                    setErrorCode('not_found');
                    setErrorMessage('Invalid download link structure.');
                }
                return;
            }

            try {
                // Anonymous safe edge invocation
                const { data, error } = await supabase.functions.invoke('generate-download', {
                    body: { download_id: id },
                });

                if (!mounted) return;

                if (error) {
                    console.error("Transmission Error:", error.message);
                    setStatus('error');
                    setErrorCode('network_error');
                    setErrorMessage('Failed to connect to the delivery edge cluster.');
                    return;
                }

                if (data?.error) {
                    setStatus('error');
                    setErrorCode(data.error);
                    setErrorMessage(data.message || 'An unknown error occurred.');
                    return;
                }

                if (data?.targetUrl) {
                    setStatus('success');
                    // Direct hard redirect to the Cloudflare R2 presigned streaming URL
                    window.location.href = data.targetUrl;
                } else {
                    setStatus('error');
                    setErrorCode('unknown');
                    setErrorMessage('Malformed response from delivery cluster.');
                }

            } catch (err: any) {
                console.error("Resolution Crash:", err.message);
                if (mounted) {
                    setStatus('error');
                    setErrorCode('internal_error');
                    setErrorMessage('Failed to process secure handoff.');
                }
            }
        };

        bootDelivery();

        return () => {
            mounted = false;
        };
    }, [id]);

    const renderOverlay = () => {
        if (status === 'validating') {
            return (
                <div className="flex flex-col items-center justify-center space-y-6">
                    <Loader2 className="w-16 h-16 text-nano-yellow animate-spin" />
                    <h2 className="text-2xl font-bold tracking-tight text-white">Preparing Installer...</h2>
                    <p className="text-nano-text text-sm max-w-sm text-center">
                        Securely negotiating physical payload transmission across edge nodes. Do not close this window.
                    </p>
                </div>
            );
        }

        if (status === 'success') {
            return (
                <div className="flex flex-col items-center justify-center space-y-6">
                    <DownloadCloud className="w-16 h-16 text-green-500 animate-pulse" />
                    <h2 className="text-2xl font-bold tracking-tight text-white">Download Initiated</h2>
                    <p className="text-nano-text text-sm max-w-md text-center">
                        If your download does not start automatically, please check your network connection or contact support.
                    </p>
                    <Link to="/account" className="mt-8 px-8 py-3 bg-white/10 hover:bg-white/20 text-white transition-colors text-sm uppercase tracking-wide border border-white/20">
                        Return to Dashboard
                    </Link>
                </div>
            );
        }

        // Error Routes mapped tightly to Edge Function outputs
        return (
            <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-lg mx-auto bg-black/40 border border-red-900/40 p-10 backdrop-blur-md rounded-sm">
                
                {errorCode === 'expired_link' ? (
                    <AlertCircle className="w-16 h-16 text-nano-yellow/80" />
                ) : errorCode === 'missing_installer' ? (
                    <DownloadCloud className="w-16 h-16 text-orange-500/80" />
                ) : (
                    <AlertTriangle className="w-16 h-16 text-red-500/80" />
                )}

                <h2 className="text-3xl font-bold tracking-tight text-white text-center">
                    {errorCode === 'expired_link' ? 'Link Expired' : 
                     errorCode === 'missing_installer' ? 'Installer Unavailable' : 'Delivery Failed'}
                </h2>

                <p className="text-nano-text text-center text-sm leading-relaxed max-w-sm">
                    {errorMessage}
                    {errorCode === 'expired_link' && ' Your purchase is still valid. Please sign in to your dashboard for a fresh link.'}
                    {errorCode === 'missing_installer' && ' Please contact support if this error persists.'}
                </p>

                <div className="flex gap-4 pt-6 w-full">
                    <Link to="/account" className="flex-1 px-4 py-3 bg-nano-yellow hover:bg-nano-gold text-black text-center font-bold text-sm uppercase tracking-wide transition-colors">
                        Go to Dashboard
                    </Link>
                    <a href="mailto:support@castdirectorstudio.com" className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white text-center font-bold text-sm uppercase tracking-wide transition-colors border border-white/10">
                        Contact Support
                    </a>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-nano-dark text-white flex items-center justify-center inset-0 fixed z-50">
            {/* Ambient Background Glow matching CDS vibes */}
            <div className="absolute inset-0 z-0 flex justify-center items-center pointer-events-none opacity-40">
                <div className="w-[800px] h-[800px] bg-nano-yellow/10 rounded-full blur-[120px]"></div>
            </div>
            
            <div className="z-10 w-full px-6">
                {renderOverlay()}
            </div>
        </div>
    );
};

export default DownloadHandler;
