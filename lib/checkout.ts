import { supabase } from './supabase';

export async function beginCheckout(productKey: string) {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        throw new Error('You must be signed in before checkout.');
    }

    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
        throw new Error('Missing auth session.');
    }

    const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lemonsqueezy-create-checkout`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                productKey,
                redirectUrl: `${window.location.origin}/checkout/success`,
            }),
        },
    );

    const result = await response.json();

    if (!response.ok || !result.url) {
        throw new Error(result.error || 'Unable to create checkout');
    }

    window.location.href = result.url;
}