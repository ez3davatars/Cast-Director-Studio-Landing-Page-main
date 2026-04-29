import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Check, Loader2 } from 'lucide-react';
import DuplicatePurchaseModal from './DuplicatePurchaseModal';
import { getProductByKey, getProductByStripePriceId, resolveCatalogEntryFromDbProduct, resolveDisplayName } from '../lib/products';
import { supabase } from '../lib/supabase';

/* ── Fallback prices shown when live pricing data is unavailable ── */
const FALLBACK_PRICES: Record<string, { displayPrice: string; interval: string; billingSuffix: string }> = {
  starter:                { displayPrice: '$29',  interval: 'month', billingSuffix: '/month' },
  pro:                    { displayPrice: '$99',  interval: 'month', billingSuffix: '/month' },
  indie_desktop_byok:     { displayPrice: '$199', interval: '',      billingSuffix: ' one-time' },
  agency_desktop_byok:    { displayPrice: '$699', interval: '',      billingSuffix: ' one-time' },
  indie_updates_support:  { displayPrice: '$79',  interval: 'year',  billingSuffix: '/year' },
  agency_updates_support: { displayPrice: '$199', interval: 'year',  billingSuffix: '/year' },
};

/* ── Authoritative feature lists per plan ──
   These override DB features to avoid implying feature gating the app
   does not actually enforce. Core creative features are the same across
   all plans — the real difference is usage/credits and licensing model. */
const PLAN_FEATURES: Partial<Record<string, string[]>> = {
  starter: [
    'Desktop Application Access',
    'Full Creator Workflow Access',
    'Hosted Processing, Temporary Delivery',
    'Monthly Generation Credits: 200',
    'Device Activations: 2',
    'Commercial Use Included',
    'Standard Support',
    'Best for light creator use',
  ],
  pro: [
    'Desktop Application Access',
    'Full Creator Workflow Access',
    'Hosted Processing, Temporary Delivery',
    'Monthly Generation Credits: 1,000',
    'Device Activations: 2',
    'Commercial Use Included',
    'Standard Support',
    'Best for higher-volume creators',
  ],
  indie_desktop_byok: [
    'Desktop Application Access',
    'Full Creator Workflow Access',
    'BYOK API Access',
    'Use Your Own AI Provider/API Key',
    'Device Activation: 1',
    'Perpetual License',
    'Updates Included: 12 Months',
    'Commercial Use Included',
    'Standard Support',
    'Best for independent creators',
  ],
  agency_desktop_byok: [
    'Desktop Application Access',
    'Full Creator Workflow Access',
    'BYOK API Access',
    'Use Your Own AI Provider/API Key',
    'Device Activations: 3',
    'Perpetual License',
    'Updates Included: 12 Months',
    'Commercial Use Included',
    'Agency / Client Work Use',
    'Priority Support',
    'Best for studios, teams, and client work',
  ],
};

interface PricingProps {
  session: Session | null;
  onCreateAccount: () => void;
  onSignIn: () => void;
}

interface PricingCardProps {
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
  ctaText: string;
  billingSuffix?: string;
  onCheckout: () => void;
}

const PricingCard: React.FC<PricingCardProps> = ({
  name,
  price,
  features,
  isPopular,
  ctaText,
  billingSuffix,
  onCheckout,
}) => {
  // Sanitize feature labels from Supabase for public display clarity
  const featureLabelMap: Record<string, string> = {
    'Batch Rendering': 'Multi-Shot Rendering',
  };

  const renderFeature = (feat: string, i: number) => {
    let display = String(feat);
    if (typeof feat === 'object' && feat !== null) {
      if ((feat as any).display_name) {
        const name = (feat as any).display_name;
        const val = (feat as any).display_value;
        const rawVal = (feat as any).value;
        
        if (val) {
          display = `${name}: ${val}`;
        } else if (typeof rawVal === 'number' || typeof rawVal === 'string') {
          display = `${name}: ${rawVal}`;
        } else {
          display = name;
        }
      } else {
        display = (feat as any).name || (feat as any).text || JSON.stringify(feat);
      }
    }

    // Apply label sanitization
    display = featureLabelMap[display] || display;

    return (
      <li key={i} className="flex items-start gap-4 text-[15px] leading-snug text-slate-300">
        <Check size={18} className={`mt-0.5 shrink-0 ${isPopular ? 'text-nano-yellow' : 'text-emerald-400'}`} strokeWidth={3} />
        <span>{display}</span>
      </li>
    );
  };

  return (
    <div
      className={`relative flex flex-col rounded-[28px] transition-all duration-300 h-full overflow-hidden ${isPopular
          ? 'bg-gradient-to-b from-amber-950/30 via-[#0f172a] to-nano-surface1 ring-1 ring-nano-yellow/30 transform scale-105 z-10'
          : 'bg-nano-surface1/60 border border-white/[0.06] hover:ring-1 hover:ring-white/20'
        }`}
    >
      {isPopular && (
        <div className="w-full bg-gradient-to-r from-nano-yellow via-amber-400 to-nano-yellow text-black text-[11px] font-bold px-5 py-2 text-center uppercase tracking-[0.2em]">
          Most Popular
        </div>
      )}

      <div className="flex-1 flex flex-col p-10">
        <div className="mb-10">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 font-display">
            {name}
          </h3>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-bold text-white tracking-tight font-display">{price}</span>
            {billingSuffix && <span className="text-slate-400 font-medium ml-1">{billingSuffix}</span>}
          </div>
          {/* Editorial rule under price */}
          <div className="mt-4 h-[1px] w-full bg-gradient-to-r from-white/[0.06] to-transparent" />
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-10">
          {features.map((feat, i) => renderFeature(feat, i))}
        </ul>

        {/* Spacer pushes CTA to bottom of equal-height cards */}
        <div className="flex-1" />

        <button
          type="button"
          disabled={isPopular === null ? false : undefined}
          onClick={onCheckout}
          className={`w-full py-4 px-6 rounded-full text-sm font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-2 ${isPopular
              ? 'bg-nano-yellow text-black hover:bg-[#eab308] hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0'
              : 'bg-white/10 text-white hover:bg-[#d4a017] hover:text-black hover:shadow-[0_0_20px_rgba(212,160,23,0.35)] hover:-translate-y-0.5 disabled:opacity-50'
            }`}
        >
          {ctaText === 'Starting...' && <Loader2 size={16} className="animate-spin" />}
          {ctaText}
        </button>
      </div>
    </div>
  );
};

const Pricing: React.FC<PricingProps> = ({
  session,
  onCreateAccount,
  onSignIn,
}) => {
    const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkingOutProductId, setCheckingOutProductId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{product: any, duplicateType: 'block' | 'warn' | 'allow', isSupport: boolean} | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true);
        
        if (data) {
          setProducts(data);
        }
      } catch (err) {
        console.error('Failed to fetch active products:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProducts();
  }, []);


  const executeCheckout = async (product: any, allowDuplicatePurchase: boolean = false) => {
    setCheckingOutProductId(product.id);
    setCheckoutError(null);
    setDuplicateWarning(null);

    try {
      const { data: { session: activeSession }, error: authError } = await supabase.auth.getSession();
      
      if (!activeSession || !activeSession.access_token || authError) {
        setCheckoutError("No valid access token available. Please sign in to verify your identity.");
        await supabase.auth.signOut();
        onSignIn();
        setCheckingOutProductId(null);
        return;
      }

      // Catalog-driven Success Routing
      let successType = 'byok';
      const catalogEntry = resolveCatalogEntryFromDbProduct(product);
      if (catalogEntry) {
          if (catalogEntry.productType === 'subscription') successType = 'hosted';
          else if (catalogEntry.productType === 'support_plan') successType = 'renewal';
          else if (catalogEntry.productType === 'desktop_license') successType = 'byok';
      }

      const returnUrl = `${window.location.origin}/get-started?session_id={CHECKOUT_SESSION_ID}&type=${successType}`;
      
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { 
          priceId: product.stripe_price_id,
          successUrl: returnUrl,
          cancelUrl: `${window.location.origin}/#pricing`,
          allowDuplicatePurchase
        }
      });

      if (error) {
        if (error.message?.includes('401') || error.message?.includes('non-2xx') || error.message?.includes('409') || error.message?.includes('duplicate_purchase')) {
            let parsedErr;
            try { parsedErr = await error.context?.json?.(); } catch(e){}
            
            if ((parsedErr && parsedErr.error === 'duplicate_purchase') || error.message.includes('409') || error.message.includes('duplicate_purchase')) {
                setCheckoutError("Server blocked purchase to prevent a duplicate charge. Please check your dashboard.");
            } else {
                setCheckoutError("Checkout was rejected by the server. " + (parsedErr?.message || error.message));
            }
            throw new Error("Rejected by checkout Edge Function.");
        }
        throw new Error(error.message || "Failed to establish secure connection.");
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Checkout session URL was not returned by the server.");
      }

    } catch (err: any) {
      console.error("Checkout launch failed:", err);
      setCheckoutError(err.message || "An unexpected error occurred during checkout initialization.");
    } finally {
      if (!window.location.href.includes('stripe')) setCheckingOutProductId(null);
    }
  };

  /* ── Guest Checkout: no auth required ── */
  const executeGuestCheckout = async (product: any) => {
    setCheckingOutProductId(product.id);
    setCheckoutError(null);

    try {
      let successType = 'byok';
      const catalogEntry = resolveCatalogEntryFromDbProduct(product);
      if (catalogEntry) {
        if (catalogEntry.productType === 'subscription') successType = 'hosted';
        else if (catalogEntry.productType === 'support_plan') successType = 'renewal';
        else if (catalogEntry.productType === 'desktop_license') successType = 'byok';
      }

      const successUrl = `${window.location.origin}/get-started?session_id={CHECKOUT_SESSION_ID}&type=${successType}`;
      const cancelUrl = `${window.location.origin}/#pricing`;

      // Call the Edge Function with anon key as bearer (required by Supabase gateway)
      // and guestCheckout flag so the function skips JWT user validation
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const functionUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          priceId: product.stripe_price_id,
          successUrl,
          cancelUrl,
          guestCheckout: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Checkout failed (${response.status})`);
      }

      const data = await response.json();

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Checkout session URL was not returned by the server.');
      }
    } catch (err: any) {
      console.error('Guest checkout failed:', err);
      setCheckoutError(err.message || 'An unexpected error occurred during checkout.');
    } finally {
      if (!window.location.href.includes('stripe')) setCheckingOutProductId(null);
    }
  };

  const executePreCheck = async (product: any, catalogEntry: any) => {
    if (catalogEntry && catalogEntry.duplicatePolicy !== 'allow') {
        const isSupport = catalogEntry.productType === 'support_plan';
        const { data: licenses } = await supabase.from('licenses')
            .select('*, products ( name )')
            .eq('user_id', session!.user.id)
            .ilike('status', 'active');
            
        const { data: subs } = await supabase.from('subscriptions').select('metadata, status').eq('user_id', session!.user.id);
        
        let hasMatch = false;
        if (licenses) {
            hasMatch = hasMatch || licenses.some((l: any) => {
                const lEntry = getProductByStripePriceId(l.stripe_price_id) || getProductByKey(l.product_id);
                const pName = product.name || '';
                const ownedName = (l.license_name || l.products?.name || '').toLowerCase().trim();
                const targetName = pName.toLowerCase().trim();
                
                return (lEntry && lEntry.productKey === catalogEntry.productKey) || 
                       l.product_id === product.id ||
                       (ownedName && targetName && ownedName === targetName);
            });
        }
        if (subs && !hasMatch) {
            hasMatch = hasMatch || subs.some((s: any) => s.status === 'active' && s.metadata?.stripe_price_id === product.stripe_price_id);
        }
        
        if (hasMatch) {
            setDuplicateWarning({ product, duplicateType: catalogEntry.duplicatePolicy, isSupport });
            return false;
        }
    }
    return true;
  };

  const handleCheckout = async (product: any) => {
    if (!product.is_active || !product.stripe_price_id) {
      setCheckoutError("This product is currently unavailable for automated checkout.");
      return;
    }

    // Guest checkout: skip pre-check (no user to check against)
    if (!session) {
      await executeGuestCheckout(product);
      return;
    }

    // Authenticated checkout: full pre-check + duplicate guard
    setCheckingOutProductId(product.id);
    setCheckoutError(null);

    try {
       const catalogEntry = resolveCatalogEntryFromDbProduct(product);
       
       const passedPreCheck = await executePreCheck(product, catalogEntry);
       if (!passedPreCheck) {
           setCheckingOutProductId(null);
           return;
       }
       
       await executeCheckout(product, false);

    } catch(err: any) {
       console.error("Pre-checkout check failed", err);
       setCheckoutError("Pre-checkout check failed: " + (err.message || String(err)));
       setCheckingOutProductId(null);
    }
  };

  return (
    <section id="pricing" className="py-32 relative z-10">
      {/* Warm section divider */}
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="mx-auto mb-20 max-w-4xl text-center glass-panel-premium p-8 md:p-14 rounded-[32px] relative overflow-hidden shadow-2xl">
          {/* Enhanced top gradient line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[2px] bg-gradient-to-r from-transparent via-nano-yellow/60 to-transparent" />
          {/* Subtle noise overlay */}
          <div className="absolute inset-0 surface-noise opacity-30 pointer-events-none" />
          
          <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[40px] leading-tight mb-8 relative z-10">
            One Local Desktop App.<br className="hidden md:block" /> Two Ways to Power Generation.
          </h2>
          <div className="max-w-2xl mx-auto space-y-5 relative z-10">
            <p className="text-[16px] leading-relaxed text-slate-300 font-medium">
              Cast Director Studio is always a local desktop app with the same core tools and workflow. Users can either connect their own Gemini API key or use EZ3D Avatars' credit-based access.
            </p>
            <p className="text-[16px] leading-relaxed text-slate-300">
              Some packages include credits upfront, and additional credits can be purchased as needed. The difference is in usage and billing, not in feature access.
            </p>
          </div>
        </div>

        
        {duplicateWarning && (
            <DuplicatePurchaseModal
                productName={duplicateWarning.product.name}
                duplicateType={duplicateWarning.duplicateType}
                isSupport={duplicateWarning.isSupport}
                onClose={() => setDuplicateWarning(null)}
                onContinueAnyway={() => {
                    executeCheckout(duplicateWarning.product, true);
                }}
            />
        )}
        {checkoutError && (
          <div className="max-w-3xl mx-auto mb-8 p-4 border border-red-500/50 bg-red-900/20 text-red-200 text-center text-sm rounded-xl">
            {checkoutError}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-nano-text">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>Loading active products...</p>
          </div>
        ) : products.length > 0 ? (
          <div className="flex flex-col gap-16">
            {/* Merchandised Group Rendering */}
            {[
              { title: "Credit Plans & Subscriptions", keys: ['starter', 'pro'] },
              { title: "Desktop Ownership", keys: ['indie_desktop_byok', 'agency_desktop_byok'] },
              { title: "Updates & Support", keys: ['indie_updates_support', 'agency_updates_support'] }
            ].map((section) => {
              const sectionProducts = section.keys.map(k => {
                 return products.find(p => resolveCatalogEntryFromDbProduct(p)?.productKey === k || p.product_key === k || p.metadata?.product_key === k);
              }).filter(Boolean);

              if (sectionProducts.length === 0) return null;

              return (
                <div key={section.title} className="max-w-6xl mx-auto w-full">
                  <h3 className="text-[11px] font-display font-bold text-slate-400 mb-8 uppercase tracking-[0.3em] flex items-center gap-4">
                    <span>{section.title}</span>
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </h3>
                  <div className="grid md:grid-cols-2 gap-8 items-stretch">
                    {sectionProducts.map((product) => {
                      const catalogEntry = resolveCatalogEntryFromDbProduct(product);
                      const name = resolveDisplayName({ productKey: catalogEntry?.productKey, stripePriceId: product.stripe_price_id, fallbackName: product.name });

                      // Resolve price: live data → metadata → plan-specific fallback
                      const fallback = catalogEntry ? FALLBACK_PRICES[catalogEntry.productKey] : undefined;
                      let price: string;
                      let billingSuffix: string;

                      if (product.price != null) {
                        price = `$${product.price}`;
                        billingSuffix = product.interval ? `/${product.interval}` : (product.metadata?.billingSuffix || fallback?.billingSuffix || '');
                      } else if (product.metadata?.price) {
                        price = `$${product.metadata.price}`;
                        billingSuffix = product.interval ? `/${product.interval}` : (product.metadata?.billingSuffix || fallback?.billingSuffix || '');
                      } else if (fallback) {
                        price = fallback.displayPrice;
                        billingSuffix = fallback.billingSuffix;
                        if (process.env.NODE_ENV === 'development') {
                          console.warn(`[Pricing] Using fallback price for "${name}" (${catalogEntry?.productKey}) — live price missing from DB.`);
                        }
                      } else {
                        price = '—';
                        billingSuffix = '';
                        if (process.env.NODE_ENV === 'development') {
                          console.warn(`[Pricing] No price data and no fallback for product "${name}".`);
                        }
                      }
                      
                      // Use authoritative feature list when available; fall back to DB features
                      const productKey = catalogEntry?.productKey;
                      let features: string[] = [];
                      if (productKey && PLAN_FEATURES[productKey]) {
                        features = PLAN_FEATURES[productKey]!;
                      } else if (Array.isArray(product.features)) {
                        features = product.features;
                      } else if (Array.isArray(product.metadata?.features)) {
                        features = product.metadata.features;
                      } else if (typeof product.features === 'string') {
                        try { features = JSON.parse(product.features); } catch (e) { features = [product.features]; }
                      } else if (product.description) {
                        features = [product.description];
                      }

                      const isPopular = product.is_popular === true || product.metadata?.isPopular === 'true' || product.metadata?.isPopular === true;

                      return (
                        <PricingCard
                          key={product.id || name}
                          name={name}
                          price={price}
                          billingSuffix={billingSuffix}
                          isPopular={isPopular}
                          features={features.length > 0 ? features : ['Standard support', 'Updates included']}
                          ctaText={checkingOutProductId === product.id ? 'Starting...' : (product.metadata?.ctaText || product.ctaText || 'Get Access')}
                          onCheckout={() => {
                            if (checkingOutProductId) return;
                            handleCheckout(product);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 px-6 rounded-2xl border border-nano-border bg-nano-panel/40 max-w-3xl mx-auto text-nano-text">
            No active products found. Configure your products in Supabase.
          </div>
        )}
      </div>
    </section>
  );
};

export default Pricing;