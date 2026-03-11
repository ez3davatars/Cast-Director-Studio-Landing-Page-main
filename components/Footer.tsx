import React from 'react';
import { Twitter, Instagram, Youtube } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-black border-t border-nano-border py-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-8">
            <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 flex items-center justify-center">
                    <img src="/logo.png" alt="EZ3D Logo" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                </div>
                <div className="leading-tight">
                    <div className="font-mono font-bold text-xl tracking-wider text-white uppercase">
                        Cast Director Studio
                    </div>
                    <div className="text-[10px] text-nano-text tracking-widest uppercase">
                        Powered by Nanobanana 2
                    </div>
                </div>
            </div>
            
            <div className="flex gap-6">
                <a href="#" className="text-gray-500 hover:text-white transition-colors"><Twitter size={20} /></a>
                <a href="#" className="text-gray-500 hover:text-white transition-colors"><Instagram size={20} /></a>
                <a href="#" className="text-gray-500 hover:text-white transition-colors"><Youtube size={20} /></a>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 text-sm">
            <div>
                <h4 className="font-bold text-white mb-4">PRODUCT</h4>
                <ul className="space-y-2 text-gray-500">
                    <li><a href="#" className="hover:text-nano-yellow">Nano Cast</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Wardrobe Studio</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Download Beta</a></li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4">RESOURCES</h4>
                <ul className="space-y-2 text-gray-500">
                    <li><a href="#" className="hover:text-nano-yellow">Documentation</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Tutorials</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Community</a></li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4">LEGAL</h4>
                <ul className="space-y-2 text-gray-500">
                    <li><a href="#" className="hover:text-nano-yellow">Terms of Service</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Privacy Policy</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Biometric Data Usage</a></li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4">COMPANY</h4>
                <ul className="space-y-2 text-gray-500">
                    <li><a href="#" className="hover:text-nano-yellow">About Nanobanana</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Careers</a></li>
                    <li><a href="#" className="hover:text-nano-yellow">Contact</a></li>
                </ul>
            </div>
        </div>

        <div className="border-t border-gray-900 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-600 font-mono">
            <p>&copy; 2026 EZ3D AVATARS, LLC. All rights reserved.</p>
            <p>System Status: <span className="text-green-500">Operational</span></p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;