import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Check, Loader2 } from 'lucide-react';
import DuplicatePurchaseModal from './DuplicatePurchaseModal';
import { getProductByKey, getProductByStripePriceId } from '../lib/products';
import { supabase } from '../lib/supabase';

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
  return (
    <div
      className={`relative flex flex-col p-8 rounded-sm transition-all duration-300 ${isPopular
          ? 'bg-nano-panel border border-nano-yellow transform scale-105 shadow-[0_0_30px_rgba(250,204,21,0.15)] z-10'
          : 'bg-nano-panel/40 border border-nano-border hover:border-nano-text'
        }`}
    >
      {isPopular && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-nano-yellow text-black text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider shadow-lg">
          Most Popular
        </div>
      )}

      <div className="mb-8">
        <h3 className="text-lg font-mono text-nano-text uppercase tracking-widest mb-2">
          {name}
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-white">{price}</span>
          {billingSuffix && <span className="text-nano-text">{billingSuffix}</span>}
        </div>
      </div>

      <ul className="flex-1 space-y-4 mb-8">
        {features.map((feat, i) => {
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

          return (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
              <Check size={16} className="text-nano-yellow mt-0.5 shrink-0" />
              <span>{display}</span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={isPopular === null ? false : undefined /* hack to fix unused warning */}
        onClick={onCheckout}
        className={`w-full py-4 px-6 rounded-sm text-sm font-bold tracking-wide uppercase transition-colors flex items-center justify-center gap-2 ${isPopular
            ? 'bg-nano-yellow text-black hover:bg-nano-gold disabled:opacity-50'
            : 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50'
          }`}
      >
        {ctaText === 'Starting...' && <Loader2 size={16} className="animate-spin" />}
        {ctaText}
      </button>
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

      let successType = 'byok';
      const pType = (product.product_type || '').toLowerCase();
      
      if (pType.includes('sub') || pType.includes('hosted')) {
        successType = 'hosted';
      } else if (pType.includes('renew')) {
        successType = 'renewal';
      }

      const returnUrl = `${window.location.origin}/success/${successType}`;
      
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { 
          priceId: product.stripe_price_id,
          successUrl: returnUrl,
          cancelUrl: `${window.location.origin}/#pricing`,
          allowDuplicatePurchase
        }
      });

      if (error) {
        if (error.message?.includes('401') || error.message?.includes('non-2xx') || error.message?.includes('409')) {
            const errStr = await error.context?.json?.() || error.message;
            if (JSON.stringify(errStr).includes('duplicate_purchase') || error.message.includes('409')) {
                setCheckoutError("Server blocked purchase to prevent a duplicate charge. Please check your dashboard.");
            } else {
                setCheckoutError("Checkout was rejected by the server. " + error.message);
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

  const handleCheckout = async (product: any) => {
    if (!session) {
      onSignIn();
      return;
    }

    if (!product.is_active || !product.stripe_price_id) {
      setCheckoutError("This product is currently unavailable for automated checkout.");
      return;
    }

    setCheckingOutProductId(product.id);
    setCheckoutError(null);

    try {
       const pKey = product.product_key || product.metadata?.product_key;
       const catalogEntry = getProductByKey(pKey) || getProductByStripePriceId(product.stripe_price_id);
       
       console.log("=============== DEBUG PRICING ===============");
       console.log("Raw Product from DB:", JSON.stringify(product, null, 2));
       console.log("Extracted pKey:", pKey);
       console.log("Extracted stripe_price_id:", product.stripe_price_id);
       if (catalogEntry && catalogEntry.duplicatePolicy !== 'allow') {
           const isSupport = catalogEntry.productType === 'support_plan';
           // Fetch licenses with a JOIN on products so we can examine the legacy product name even if the UUIDs don't match
           const { data: licenses } = await supabase.from('licenses')
               .select('*, products ( name )')
               .eq('user_id', session.user.id)
               .ilike('status', 'active');
               
           const { data: subs } = await supabase.from('subscriptions').select('metadata, status').eq('user_id', session.user.id);
           
           let hasMatch = false;
           // Check licenses
           if (licenses) {
               hasMatch = hasMatch || licenses.some((l: any) => {
                   const lEntry = getProductByStripePriceId(l.stripe_price_id) || getProductByKey(l.product_id);
                   const pName = product.name || '';
                   
                   // Determine the name of the license they already own
                   const ownedName = (l.license_name || l.products?.name || '').toLowerCase().trim();
                   const targetName = pName.toLowerCase().trim();
                   
                   return (lEntry && lEntry.productKey === catalogEntry.productKey) || 
                          l.product_id === product.id ||
                          (ownedName && targetName && ownedName === targetName);
               });
           }
           // Check subscriptions (simplified check looking for matching metadata product_key or price_id)
           if (subs && !hasMatch) {
               hasMatch = hasMatch || subs.some((s: any) => s.status === 'active' && s.metadata?.stripe_price_id === product.stripe_price_id);
           }
           
           if (hasMatch) {
               setCheckingOutProductId(null);
               setDuplicateWarning({ product, duplicateType: catalogEntry.duplicatePolicy, isSupport });
               return;
           }
       }
       
       await executeCheckout(product, false);

    } catch(err: any) {
       console.error("Pre-checkout check failed", err);
       setCheckoutError("Debug Mode Trapped Error: " + (err.message || String(err)));
       setCheckingOutProductId(null);
    }
  };

  return (
    <section id="pricing" className="py-24 bg-nano-dark border-t border-nano-border">
      <div className="container mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">PRICING</h2>
          <p className="text-nano-text max-w-3xl mx-auto mb-2">
            Review our active plans and capabilities below.
          </p>
          <div className="inline-flex items-center justify-center space-x-2 bg-nano-panel/50 border border-nano-border rounded-full px-4 py-1.5 text-xs text-nano-text uppercase tracking-wider">
             <span className="w-2 h-2 rounded-full bg-nano-yellow animate-pulse"></span>
             <span>Available for Windows 10/11. Mac coming soon.</span>
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
          <div className="max-w-3xl mx-auto mb-8 p-4 border border-red-500/50 bg-red-900/20 text-red-200 text-center text-sm">
            {checkoutError}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-nano-text">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>Loading active products...</p>
          </div>
        ) : products.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
            {products.map((product) => {
              // Resilient mapping since we don't know the exact schema
              const name = product.name || 'Plan';
              const price = product.price != null ? `$${product.price}` : product.metadata?.price ? `$${product.metadata.price}` : 'Live Price';
              const billingSuffix = product.interval ? `/${product.interval}` : product.metadata?.billingSuffix || '';
              
              let features: string[] = [];
              if (Array.isArray(product.features)) features = product.features;
              else if (Array.isArray(product.metadata?.features)) features = product.metadata.features;
              else if (typeof product.features === 'string') {
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
                    if (checkingOutProductId) return; // Prevent double clicks on other cards
                    handleCheckout(product);
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 px-6 rounded-sm border border-nano-border bg-nano-panel/40 max-w-3xl mx-auto text-nano-text">
            No active products found. Configure your products in Supabase.
          </div>
        )}
      </div>
    </section>
  );
};

export default Pricing;