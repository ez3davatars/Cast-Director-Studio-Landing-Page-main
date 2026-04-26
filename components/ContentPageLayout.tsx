import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

interface ContentPageLayoutProps {
  title: string;
  children: React.ReactNode;
  session?: any;
  onCreateAccount?: () => void;
  onSignIn?: () => void;
}

/**
 * Shared layout wrapper for all content/info pages (docs, legal, about, etc.).
 * Provides: Navbar, Footer, cinematic background, scroll-to-top, and document.title.
 */
export default function ContentPageLayout({
  title,
  children,
  session = null,
  onCreateAccount = () => {},
  onSignIn = () => {},
}: ContentPageLayoutProps) {
  const { pathname } = useLocation();

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
        <Navbar session={session} onCreateAccount={onCreateAccount} onSignIn={onSignIn} />

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
