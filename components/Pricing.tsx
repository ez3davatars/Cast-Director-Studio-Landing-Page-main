import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { beginCheckout } from '../lib/checkout';

type CheckoutProductKey =
  | 'starter_monthly'
  | 'pro_monthly'
  | 'indie_desktop'
  | 'agency_commercial';

interface PricingCardProps {
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
  ctaText?: string;
  billingSuffix?: string;
  productKey?: CheckoutProductKey;
  onCheckout?: (productKey: CheckoutProductKey) => Promise<void>;
  loadingProductKey?: CheckoutProductKey | null;
}

const PricingCard: React.FC<PricingCardProps> = ({
  name,
  price,
  features,
  isPopular,
  ctaText = 'Get Started',
  billingSuffix,
  productKey,
  onCheckout,
  loadingProductKey,
}) => {
  const isLoading = !!productKey && loadingProductKey === productKey;

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
        {features.map((feat, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
            <Check size={16} className="text-nano-yellow mt-0.5 shrink-0" />
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={isLoading}
        onClick={productKey && onCheckout ? () => onCheckout(productKey) : undefined}
        className={`w-full py-4 px-6 rounded-sm text-sm font-bold tracking-wide uppercase transition-colors ${isPopular
            ? 'bg-nano-yellow text-black hover:bg-nano-gold'
            : 'bg-white/10 text-white hover:bg-white/20'
          } ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
      >
        {isLoading ? 'Redirecting...' : ctaText}
      </button>
    </div>
  );
};

const Pricing: React.FC = () => {
  const [mode, setMode] = useState<'cloud' | 'desktop'>('cloud');
  const [loadingProductKey, setLoadingProductKey] = useState<CheckoutProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (productKey: CheckoutProductKey) => {
    try {
      setError(null);
      setLoadingProductKey(productKey);
      await beginCheckout(productKey);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to start checkout.';
      setError(message);
      setLoadingProductKey(null);
    }
  };

  return (
    <section id="pricing" className="py-24 bg-nano-dark border-t border-nano-border">
      <div className="container mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">PRICING</h2>
          <p className="text-nano-text max-w-3xl mx-auto">
            Choose between frictionless hosted access or one-time desktop ownership.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-sm border border-nano-border bg-nano-panel/40 p-1">
            <button
              type="button"
              onClick={() => setMode('cloud')}
              className={`px-5 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${mode === 'cloud'
                  ? 'bg-nano-yellow text-black'
                  : 'text-white hover:bg-white/10'
                }`}
            >
              Cloud Hosted
            </button>
            <button
              type="button"
              onClick={() => setMode('desktop')}
              className={`px-5 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${mode === 'desktop'
                  ? 'bg-nano-yellow text-black'
                  : 'text-white hover:bg-white/10'
                }`}
            >
              Desktop BYOK
            </button>
          </div>
        </div>

        {error && (
          <div className="max-w-3xl mx-auto mb-8 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {mode === 'cloud' ? (
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
            <PricingCard
              name="Starter"
              price="$29"
              billingSuffix="/month"
              features={[
                '200 generation credits per month',
                'Up to 3 active digital doubles',
                'Hosted generation access',
                'Best for solo creators and testing workflows',
              ]}
              ctaText="Get Starter"
              productKey="starter_monthly"
              onCheckout={handleCheckout}
              loadingProductKey={loadingProductKey}
            />
            <PricingCard
              name="Pro"
              price="$99"
              billingSuffix="/month"
              isPopular
              features={[
                '1,000 generation credits per month',
                'Up to 10 active digital doubles',
                'Commercial rights included',
                'Best for working creators and small studios',
              ]}
              ctaText="Get Pro"
              productKey="pro_monthly"
              onCheckout={handleCheckout}
              loadingProductKey={loadingProductKey}
            />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
            <PricingCard
              name="Indie Desktop"
              price="$199"
              billingSuffix="one-time"
              features={[
                'Native desktop app',
                'Bring your own Vertex/Google setup',
                'Unlimited local digital doubles',
                'Personal use',
              ]}
              ctaText="Buy Indie Desktop"
              productKey="indie_desktop"
              onCheckout={handleCheckout}
              loadingProductKey={loadingProductKey}
            />
            <PricingCard
              name="Agency Commercial"
              price="$699"
              billingSuffix="one-time"
              isPopular
              features={[
                'Everything in Indie Desktop',
                'Commercial and resale rights',
                'Priority support',
                'Agency and commercial usage',
              ]}
              ctaText="Buy Agency Commercial"
              productKey="agency_commercial"
              onCheckout={handleCheckout}
              loadingProductKey={loadingProductKey}
            />
          </div>
        )}

        <div className="text-center mt-10 text-sm text-nano-text">
          Need extra hosted generations later? Credit Reload 500 is available as a separate add-on.
        </div>
      </div>
    </section>
  );
};

export default Pricing;