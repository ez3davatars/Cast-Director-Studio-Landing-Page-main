import React, { useEffect, useState, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { Routes, Route, useLocation, useNavigate, Navigate, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import LaunchAdvantage from './components/LaunchAdvantage';
import GeminiComparison from './components/GeminiComparison';
import DigitalDoubles from './components/DigitalDoubles';
import Workflow from './components/Workflow';
import AiVideoFoundations from './components/AiVideoFoundations';
import CharacterSheets from './components/CharacterSheets';
import TechSpecs from './components/TechSpecs';
import ShowcaseCarousel from './components/ShowcaseCarousel';
import Pricing from './components/Pricing';
import PrivacyAssurance from './components/PrivacyAssurance';
import FaqSection from './components/FaqSection';
import Footer from './components/Footer';
import AuthModal from './components/AuthModal';
import ProtectedRoute from './components/ProtectedRoute';
import AccountDashboard from './components/AccountDashboard';
import AffiliateDashboard from './pages/affiliate/Dashboard';
import PayoutConnectReturn from './pages/affiliate/PayoutConnectReturn';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import OrdersAdmin from './pages/admin/Orders';
import SubscriptionsAdmin from './pages/admin/Subscriptions';
import LicensesAdmin from './pages/admin/Licenses';
import WebhooksAdmin from './pages/admin/Webhooks';
import DownloadsAdmin from './pages/admin/Downloads';
import EmailsAdmin from './pages/admin/Emails';
import CustomersAdmin from './pages/admin/Customers';
import CustomerDetailAdmin from './pages/admin/CustomerDetail';
import InboxAdmin from './pages/admin/Inbox';
import LeadsAdmin from './pages/admin/Leads';
import AffiliatesAdmin from './pages/admin/Affiliates';
import AffiliateDetailAdmin from './pages/admin/AffiliateDetail';
import AffiliateProgramAdmin from './pages/admin/AffiliateProgram';
import AffiliateAssetsAdmin from './pages/admin/AffiliateAssets';
import AffiliateApplicationsAdmin from './pages/admin/AffiliateApplications';
import PayoutsAdmin from './pages/admin/Payouts';
import Success from './pages/Success';
import GetStarted from './pages/GetStarted';
import DownloadHandler from './pages/DownloadHandler';
import AffiliateRedirect from './pages/AffiliateRedirect';
import Documentation from './pages/Documentation';
import Tutorials from './pages/Tutorials';
import Community from './pages/Community';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import FaceReference from './pages/FaceReference';
import About from './pages/About';
import Careers from './pages/Careers';
import Contact from './pages/Contact';
import ResetPassword from './pages/ResetPassword';
import ScrollToTop from './components/ScrollToTop';
import { supabase } from './lib/supabase';
import { AuthContext } from './lib/authContext';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  // Ref so the onAuthStateChange closure always reads the latest modal state
  const authModalModeRef = useRef(authModalMode);
  authModalModeRef.current = authModalMode;

  // Ref to track the location state when the auth modal was opened
  // (ProtectedRoute stores { from: location } here)
  const authRedirectFromRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setIsLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession ?? null);
      setIsLoadingSession(false);

      // Post-login redirect: only when signing in through the auth modal
      if (event === 'SIGNED_IN' && nextSession && authModalModeRef.current) {
        // Close the modal
        setAuthModalMode(null);

        // Redirect to the originally requested page, or default to /account
        const destination = authRedirectFromRef.current || '/account';
        authRedirectFromRef.current = undefined;
        navigate(destination, { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    // If redirected from ProtectedRoute, auth query param will be present
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('auth') === 'signin' && !session && !isLoadingSession) {
      // Capture the protected route the user was trying to access
      const fromPath = (location.state as any)?.from?.pathname;
      if (fromPath) {
        authRedirectFromRef.current = fromPath;
      }

      setAuthModalMode('signin');
      // Clear the query param so it doesn't re-trigger on reload/hot-reload
      searchParams.delete('auth');
      const cleanSearch = searchParams.toString();
      window.history.replaceState({}, '', `${location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`);
    }
  }, [location.search, session, isLoadingSession]);

  const openCreateAccount = () => setAuthModalMode('signup');
  const openSignIn = () => setAuthModalMode('signin');
  const closeAuthModal = () => setAuthModalMode(null);

  if (isLoadingSession) {
      const isBillingReturn = new URLSearchParams(window.location.search).get('billing') === 'return';
      return (
          <div className="min-h-screen bg-nano-dark text-white flex items-center justify-center">
              <div className="text-nano-text animate-pulse">
                  {isBillingReturn ? 'Refreshing your billing details...' : 'Initializing Session...'}
              </div>
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
        <GeminiComparison />
        <ShowcaseCarousel />
        <DigitalDoubles />
        <Workflow />
        <PrivacyAssurance />
        <AiVideoFoundations />
        <CharacterSheets />
        <TechSpecs />
        <Pricing session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />
        <FaqSection />
        <Footer />
      </div>
    </div>
  );

  return (
    <AuthContext.Provider value={{ session, openCreateAccount, openSignIn }}>
      <div className="min-h-screen bg-nano-dark text-white relative">
        <ScrollToTop />
        {authModalMode && (
          <AuthModal
            initialMode={authModalMode}
            session={session}
            onClose={closeAuthModal}
          />
        )}

        <Routes>
          <Route path="/" element={LandingPage} />
          <Route path="/pricing" element={LandingPage} />
          
          <Route path="/success/:type" element={<Success />} />
          <Route path="/get-started" element={<GetStarted />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* Secure Cloudflare R2 Delivery Handoff Route */}
          <Route path="/download/:id" element={<DownloadHandler />} />
          <Route path="/a/:code" element={<AffiliateRedirect />} />

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

          <Route
            path="/affiliate"
            element={
              <ProtectedRoute session={session}>
                <Navbar session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />
                {session && <AffiliateDashboard session={session} />}
                <Footer />
              </ProtectedRoute>
            }
          />

          <Route
            path="/affiliate/payouts/return"
            element={
              <ProtectedRoute session={session}>
                <Navbar session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />
                {session && <PayoutConnectReturn session={session} mode="return" />}
                <Footer />
              </ProtectedRoute>
            }
          />

          <Route
            path="/affiliate/payouts/refresh"
            element={
              <ProtectedRoute session={session}>
                <Navbar session={session} onCreateAccount={openCreateAccount} onSignIn={openSignIn} />
                {session && <PayoutConnectReturn session={session} mode="refresh" />}
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
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<OrdersAdmin />} />
            <Route path="subscriptions" element={<SubscriptionsAdmin />} />
            <Route path="licenses" element={<LicensesAdmin />} />
            <Route path="webhooks" element={<WebhooksAdmin />} />
            <Route path="downloads" element={<DownloadsAdmin />} />
            <Route path="emails" element={<EmailsAdmin />} />
            <Route path="customers" element={<CustomersAdmin />} />
            <Route path="customers/:id" element={<CustomerDetailAdmin />} />
            <Route path="inbox" element={<InboxAdmin />} />
            <Route path="leads" element={<LeadsAdmin />} />
            <Route path="affiliates" element={<AffiliatesAdmin />} />
            <Route path="affiliates/:id" element={<AffiliateDetailAdmin />} />
            <Route path="affiliate-program" element={<AffiliateProgramAdmin />} />
            <Route path="affiliate-applications" element={<AffiliateApplicationsAdmin />} />
            <Route path="affiliate-assets" element={<AffiliateAssetsAdmin />} />
            <Route path="payouts" element={<PayoutsAdmin />} />
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
    </AuthContext.Provider>
  );
}

export default App;
