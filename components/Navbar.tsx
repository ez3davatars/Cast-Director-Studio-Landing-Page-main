import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Menu, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NavbarProps {
  session: Session | null;
  onCreateAccount: () => void;
  onSignIn: () => void;
}

const Navbar: React.FC<NavbarProps> = ({
  session,
  onCreateAccount,
  onSignIn,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMobileMenuOpen(false);
  };

  const navLinks = [
    { name: 'Workflow', href: '/#workflow' },
    { name: 'Studio Access', href: '/#pricing' },
    { name: 'Account', href: '/account' },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${isScrolled
          ? 'bg-nano-abyss/90 backdrop-blur-xl border-b border-nano-border'
          : 'bg-transparent'
        }`}
    >
      <div className="container mx-auto px-6 max-w-[1400px]">
        <div className="flex items-center justify-between h-[88px]">
          <a href="#" className="flex items-center gap-3">
            <div className="relative w-12 h-12 flex items-center justify-center">
                <img src="/logo.png" alt="EZ3D Logo" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-mono font-bold text-2xl tracking-tight text-white">
                Cast Director Studio
              </span>
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium mt-0.5">
                Powered by Nanobanana 2
              </span>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-[13px] font-semibold uppercase tracking-[0.1em] text-slate-400 hover:text-white transition-colors"
              >
                {link.name}
              </a>
            ))}

            {session?.user?.app_metadata?.is_admin === true && (
              <a
                href="/admin"
                className="text-sm uppercase tracking-wide font-bold text-nano-yellow hover:text-nano-gold transition-colors border border-nano-yellow/30 px-3 py-1 rounded bg-nano-yellow/10"
              >
                Admin Ops
              </a>
            )}

            {session ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 max-w-[220px] truncate font-medium">
                  {session.user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-5 py-2.5 rounded-full border border-white/10 text-white text-[13px] font-semibold uppercase tracking-wide hover:bg-white/5 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="px-5 py-2.5 rounded-full border border-transparent text-white text-[13px] font-semibold uppercase tracking-wide hover:bg-white/5 transition-colors"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={onCreateAccount}
                  className="px-6 py-2.5 rounded-full bg-nano-yellow text-black text-[13px] font-bold uppercase tracking-wide hover:bg-[#eab308] hover:shadow-[0_0_15px_rgba(250,204,21,0.2)] transition-all ring-1 ring-nano-yellow/20"
                >
                  Create Account
                </button>
              </div>
            )}
          </nav>

          <button
            type="button"
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-6 border-t border-nano-border">
            <div className="flex flex-col gap-4 pt-4">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm uppercase tracking-wide text-nano-text hover:text-white transition-colors"
                >
                  {link.name}
                </a>
              ))}

              {session ? (
                <>
                  <div className="text-sm text-nano-text break-all">
                    {session.user.email}
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full px-4 py-3 border border-nano-border text-white text-sm uppercase tracking-wide hover:bg-white/10 transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignIn();
                    }}
                    className="w-full px-4 py-3 border border-nano-border text-white text-sm uppercase tracking-wide hover:bg-white/10 transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onCreateAccount();
                    }}
                    className="w-full px-4 py-3 bg-nano-yellow text-black text-sm font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors"
                  >
                    Create Account
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;