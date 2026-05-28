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
    const [filename, setFilename] = useState<string | null>(null);

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

                const targetUrl = data?.targetUrl || data?.url;
                if (targetUrl) {
                    if (mounted) {
                        setFilename(data.filename || null);
                    }
                    setStatus('success');
                    // Direct hard redirect to the Cloudflare R2 presigned streaming URL
                    window.location.href = targetUrl;
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
            const isWindows = !filename || filename.toLowerCase().endsWith('.exe') || filename.toLowerCase().includes('win');
            return (
                <div className="flex flex-col items-center justify-center space-y-6 max-w-xl mx-auto">
                    <DownloadCloud className="w-16 h-16 text-green-500 animate-pulse" />
                    <h2 className="text-2xl font-bold tracking-tight text-white">Download Initiated</h2>
                    <p className="text-nano-text text-sm max-w-md text-center">
                        If your download does not start automatically, please check your network connection or contact support.
                    </p>

                    {isWindows && (
                        <div className="w-full text-left p-5 border border-amber-500/20 bg-amber-500/5 rounded-sm text-xs text-nano-text/90 space-y-3 mt-6">
                            <h4 className="font-bold text-amber-400 flex items-center gap-1.5 text-sm">
                                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                                Windows SmartScreen Notice
                            </h4>
                            <p className="leading-relaxed">
                                Because Cast Director Studio is a new desktop application, Windows may show a “Windows protected your PC” message the first time you open the installer.
                            </p>
                            <p className="leading-relaxed">
                                This can happen with new apps that have not yet built Microsoft SmartScreen reputation. If you downloaded Cast Director Studio from your official account dashboard at castdirectorstudio.com, this is expected.
                            </p>
                            <p className="leading-relaxed font-medium text-white/95">
                                To continue, click <span className="underline font-semibold">More info</span>, then <span className="underline font-semibold">Run anyway</span>.
                            </p>
                            <div className="pt-1">
                                <span className="font-semibold text-white/95 block mb-1">Only run the installer if:</span>
                                <ul className="list-disc pl-4 space-y-1 text-nano-text/80">
                                    <li>You downloaded it from your Cast Director Studio account dashboard.</li>
                                    <li>The file name is <span className="font-mono text-white/90">Cast-Director-Studio-Setup-1.0.0.exe</span>.</li>
                                    <li>The download source is <span className="font-medium text-white/90">Cast Director Studio / EZ3D Avatars</span>.</li>
                                </ul>
                            </div>
                            <p className="text-[10px] text-nano-text/60 leading-relaxed pt-1">
                                We are working toward Microsoft code signing and reputation improvements to reduce this warning in future releases.
                            </p>

                            <div className="pt-3 border-t border-amber-500/10">
                                <details className="group cursor-pointer select-none">
                                    <summary className="text-nano-text/50 hover:text-white transition-colors list-none flex items-center gap-1">
                                        <span className="transition-transform group-open:rotate-90">▶</span>
                                        <span>View SHA-256 Hash Verification</span>
                                    </summary>
                                    <div className="mt-2 pl-4 pr-2 py-2 bg-black/40 border border-nano-border/40 font-mono text-[10px] text-nano-yellow select-all break-all rounded-sm">
                                        <span className="text-nano-text/60 block text-[9px] uppercase tracking-wider mb-0.5">SHA-256 Hash</span>
                                        564E67B79F95B2B6558EB46ABE66C088458B93E8ABAE6F76229F2BC732A041AD
                                    </div>
                                </details>
                            </div>
                        </div>
                    )}

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
