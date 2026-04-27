import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import { useAuth } from '../App';

interface ContentPageLayoutProps {
  title: string;
  children: React.ReactNode;
}

/**
 * Shared layout wrapper for all content/info pages (docs, legal, about, etc.).
 * Provides: Navbar, Footer, cinematic background, scroll-to-top, and document.title.
 *
 * Auth state (session, sign-in/sign-up triggers) is pulled from AuthContext
 * so every content page automatically gets working Navbar auth buttons.
 */
export default function ContentPageLayout({
  title,
  children,
}: ContentPageLayoutProps) {
  const { pathname } = useLocation();
  const { session, openCreateAccount, openSignIn } = useAuth();

  useEffect(() => {
    document.title = `${title} | Cast Director Studio`;
  }, [title]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative min-h-screen bg-nano-abyss cinematic-vignette overflow-hidden">
      {/* Global texture */}
      <div className="absolute inset-0 cinematic-texture opacity-25 pointer-events-none mix-blend-screen" />

      <div className="relative z-10">
        <Navbar session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />

        <main className="px-6 pt-32 pb-20">
          <div className="mx-auto max-w-4xl">
            {children}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
