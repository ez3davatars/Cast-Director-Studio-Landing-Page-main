import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Youtube, MessageCircle, Facebook } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-[#020617] relative pt-16 pb-8">
      {/* Warm gradient top border */}
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      <div className="container mx-auto px-6 max-w-[1400px]">
        <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-8">
            <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 flex items-center justify-center">
                    <img src="/logo.png" alt="EZ3D Logo" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                </div>
                <div className="leading-tight">
                    <div className="font-mono font-bold text-2xl tracking-tight text-white">
                        Cast Director Studio
                    </div>
                    <div className="text-[11px] text-nano-text tracking-widest uppercase">
                        Powered by Nanobanana 2
                    </div>
                </div>
            </div>
            
            <div className="flex gap-6">
                <a href="https://discord.gg/5QucHe3Xd9" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#5865F2] transition-colors" aria-label="Discord"><MessageCircle size={20} /></a>
                <a href="https://x.com/EZ3DAvatars" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors" aria-label="X (formerly Twitter)"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
                <a href="https://www.instagram.com/ez3davatars/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#E4405F] transition-colors" aria-label="Instagram"><Instagram size={20} /></a>
                <a href="https://www.facebook.com/EZ3DAVATARS" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#1877F2] transition-colors" aria-label="Facebook"><Facebook size={20} /></a>
                <a href="https://www.youtube.com/@ez3davatars" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#FF0000] transition-colors" aria-label="YouTube"><Youtube size={20} /></a>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16 text-[15px]">
            <div>
                <h4 className="font-display font-bold text-white tracking-[0.2em] mb-6 text-[13px]">NAVIGATION</h4>
                <ul className="space-y-4 text-slate-400 flex flex-col font-medium">
                    <a href="/#hero" className="hover:text-white transition-colors w-fit">Home</a>
                    <a href="/#workflow" className="hover:text-white transition-colors w-fit">Workflow</a>
                    <a href="/#features" className="hover:text-white transition-colors w-fit">Features</a>
                    <a href="/#pricing" className="hover:text-white transition-colors w-fit">Pricing</a>
                    <a href="/#faq" className="hover:text-white transition-colors w-fit">FAQ</a>
                </ul>
            </div>
            <div>
                <h4 className="font-display font-bold text-white tracking-[0.2em] mb-6 text-[13px]">RESOURCES</h4>
                <ul className="space-y-4 text-slate-400 font-medium">
                    <li><Link to="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
                    <li><Link to="/tutorials" className="hover:text-white transition-colors">Tutorials</Link></li>
                    <li><Link to="/community" className="hover:text-white transition-colors">Community</Link></li>
                </ul>
            </div>
            <div>
                <h4 className="font-display font-bold text-white tracking-[0.2em] mb-6 text-[13px]">LEGAL</h4>
                <ul className="space-y-4 text-slate-400 font-medium">
                    <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                    <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                    <li><Link to="/face-reference" className="hover:text-white transition-colors">Face Reference &amp; Biometric Data</Link></li>
                </ul>
            </div>
            <div>
                <h4 className="font-display font-bold text-white tracking-[0.2em] mb-6 text-[13px]">COMPANY</h4>
                <ul className="space-y-4 text-slate-400 font-medium">
                    <li><Link to="/about" className="hover:text-white transition-colors">About EZ3D Avatars</Link></li>
                    <li><Link to="/careers" className="hover:text-white transition-colors">Careers</Link></li>
                    <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                </ul>
            </div>
        </div>

        <div className="pt-10 flex flex-col md:flex-row justify-between items-center text-sm text-slate-400 gap-4 relative">
            {/* Warm gradient separator */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
            <p className="font-medium">&copy; 2026 EZ3D AVATARS, LLC. All rights reserved.</p>
            <p className="font-semibold tracking-wide text-slate-300 uppercase text-[13px]">Local desktop workflow. Flexible API access.</p>
            <p className="font-mono text-[13px]">System Status: <span className="text-emerald-400 font-semibold">Operational</span></p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;