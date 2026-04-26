import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import LaunchAdvantage from './components/LaunchAdvantage';
import DigitalDoubles from './components/DigitalDoubles';
import Workflow from './components/Workflow';
import CharacterSheets from './components/CharacterSheets';
import TechSpecs from './components/TechSpecs';
import Pricing from './components/Pricing';
import FaqSection from './components/FaqSection';
import Footer from './components/Footer';
import AuthModal from './components/AuthModal';
import ProtectedRoute from './components/ProtectedRoute';
import AccountDashboard from './components/AccountDashboard';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import OrdersAdmin from './pages/admin/Orders';
import SubscriptionsAdmin from './pages/admin/Subscriptions';
import LicensesAdmin from './pages/admin/Licenses';
import WebhooksAdmin from './pages/admin/Webhooks';
import DownloadsAdmin from './pages/admin/Downloads';
import EmailsAdmin from './pages/admin/Emails';
import CustomersAdmin from './pages/admin/Customers';
import CustomerDetailAdmin from './pages/admin/CustomerDetail';
import InboxAdmin from './pages/admin/Inbox';
import Success from './pages/Success';
import DownloadHandler from './pages/DownloadHandler';
import Documentation from './pages/Documentation';
import Tutorials from './pages/Tutorials';
import Community from './pages/Community';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import FaceReference from './pages/FaceReference';
import About from './pages/About';
import Careers from './pages/Careers';
import Contact from './pages/Contact';
import { supabase } from './lib/supabase';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setIsLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setIsLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // If redirected from ProtectedRoute, auth query param will be present
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('auth') === 'signin' && !session && !isLoadingSession) {
      setAuthModalMode('signin');
    }
  }, [location.search, session, isLoadingSession]);

  const openCreateAccount = () => setAuthModalMode('signup');
  const openSignIn = () => setAuthModalMode('signin');
  const closeAuthModal = () => setAuthModalMode(null);

  if (isLoadingSession) {
      return (
          <div className="min-h-screen bg-nano-dark text-white flex items-center justify-center">
              <div className="text-nano-text animate-pulse">Initializing Session...</div>
          </div>
      );
  }

  const LandingPage = (
    <div className="relative min-h-screen bg-nano-abyss cinematic-vignette overflow-hidden">
      {/* Global ultra-low opacity texture */}
      <div className="absolute inset-0 cinematic-texture opacity-25 pointer-events-none mix-blend-screen"></div>
      
      {/* Page Content Layer */}
      <div className="relative z-10">
        <Navbar session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />
        <Hero />
        <LaunchAdvantage />
        <DigitalDoubles />
        <Workflow />
        <CharacterSheets />
        <TechSpecs />
        <Pricing session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />
        <FaqSection />
        <Footer />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-nano-dark text-white relative">
      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          session={session}
          onClose={closeAuthModal}
        />
      )}

      <Routes>
        <Route path="/" element={LandingPage} />
        
        <Route path="/success/:type" element={<Success />} />
        
        {/* Secure Cloudflare R2 Delivery Handoff Route */}
        <Route path="/download/:id" element={<DownloadHandler />} />

        <Route
          path="/account"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />
              {session && <AccountDashboard session={session} />}
              <Footer />
            </ProtectedRoute>
          }
        />

        {/* Phase 1 Admin Operations Core */}
        <Route 
          path="/admin" 
          element={
            <AdminRoute session={session}>
              <AdminLayout session={session as Session} />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<OrdersAdmin />} />
          <Route path="subscriptions" element={<SubscriptionsAdmin />} />
          <Route path="licenses" element={<LicensesAdmin />} />
          <Route path="webhooks" element={<WebhooksAdmin />} />
          <Route path="downloads" element={<DownloadsAdmin />} />
          <Route path="emails" element={<EmailsAdmin />} />
          <Route path="customers" element={<CustomersAdmin />} />
          <Route path="customers/:id" element={<CustomerDetailAdmin />} />
          <Route path="inbox" element={<InboxAdmin />} />
        </Route>
        
        {/* Content Pages */}
        <Route path="/docs" element={<Documentation />} />
        <Route path="/tutorials" element={<Tutorials />} />
        <Route path="/community" element={<Community />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/face-reference" element={<FaceReference />} />
        <Route path="/about" element={<About />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/contact" element={<Contact />} />

        {/* Catch-all route to prevent blank screens if the user types an invalid URL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;