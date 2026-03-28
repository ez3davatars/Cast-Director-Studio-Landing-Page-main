const fs = require('fs');
const path = './components/Pricing.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Imports
if (!content.includes('DuplicatePurchaseModal')) {
    const importStr = "import DuplicatePurchaseModal from './DuplicatePurchaseModal';\nimport { getProductByKey, getProductByStripePriceId } from '../lib/products';\n";
    const insertIdx = content.indexOf('import { supabase }') || 0;
    content = content.substring(0, insertIdx) + importStr + content.substring(insertIdx);
}

// 2. Prepare component state replacement
const stateReplacement = `  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkingOutProductId, setCheckingOutProductId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{product: any, duplicateType: 'block' | 'warn' | 'allow', isSupport: boolean} | null>(null);

  useEffect(() => {`;

content = content.replace(/(const \[products.*?\] = useState<any\[\]>\(\[\]\);.*?useEffect)/s, stateReplacement + ' {');

// 3. Prepare handleCheckout and executeCheckout replacement
const newCheckoutCode = `
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

      const returnUrl = \`\${window.location.origin}/success/\${successType}\`;
      
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { 
          priceId: product.stripe_price_id,
          successUrl: returnUrl,
          cancelUrl: \`\${window.location.origin}/#pricing\`,
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
       
       if (catalogEntry && catalogEntry.duplicatePolicy !== 'allow') {
           const isSupport = catalogEntry.productType === 'support_plan';
           const { data: licenses } = await supabase.from('licenses').select('stripe_price_id, status').eq('user_id', session.user.id).eq('status', 'active');
           const { data: subs } = await supabase.from('subscriptions').select('metadata, status').eq('user_id', session.user.id);
           
           let hasMatch = false;
           // Check licenses
           if (licenses) {
               hasMatch = hasMatch || licenses.some((l: any) => {
                   const lEntry = getProductByStripePriceId(l.stripe_price_id);
                   return lEntry && lEntry.productKey === catalogEntry.productKey;
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

    } catch(err) {
       console.error("Pre-checkout check failed", err);
       await executeCheckout(product, false); // Proceed if DB fails here
    }
  };
`;

const handleStart = content.indexOf('  const handleCheckout = async (product: any) => {');
const handleEndStr = '  return (\n    <section id="pricing"';
const handleEnd = content.indexOf(handleEndStr);

if (handleStart !== -1 && handleEnd !== -1) {
    content = content.substring(0, handleStart) + newCheckoutCode + '\n' + content.substring(handleEnd);
} else {
    console.log("Failed to find handleCheckout block");
    process.exit(1);
}

// 4. Inject Modal rendering logic below {checkoutError && ... }
const modalInsertPoint = content.indexOf('{checkoutError && (');
if (modalInsertPoint > 0) {
    const modalCode = `
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
        `;
    content = content.substring(0, modalInsertPoint) + modalCode + content.substring(modalInsertPoint);
}

fs.writeFileSync(path, content);
console.log('Successfully updated Pricing.tsx');
