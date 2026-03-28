// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, contact_id, entity_id } = await req.json();

    if (!action || !contact_id) {
      throw new Error('Missing required fields: action, contact_id');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) throw new Error('Unauthorized');
    if (user.app_metadata?.is_admin !== true) throw new Error('Forbidden: Requires Admin Role');

    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from('contacts')
      .select('email, id')
      .eq('id', contact_id)
      .single();

    if (contactErr || !contact) throw new Error(`Contact lookup failed: ${contactErr?.message}`);

    let subject = '';
    let htmlBody = '';
    let textBody = '';

    // Relational Context Generation Pipeline
    switch(action) {
        case 'purchase_receipt': {
            if (!entity_id) throw new Error('entity_id (order_id) required for purchase receipt');
            
            const { data: order, error: oe } = await supabaseAdmin.from('orders').select('*').eq('id', entity_id).single();
            if (oe || !order) throw new Error('Missing associated order context');
            
            const { data: items } = await supabaseAdmin.from('order_items').select('*, product:products(*)').eq('order_id', entity_id);
            if (!items || items.length === 0) throw new Error('Invalid order: parsing items failed.');
            
            let detectedProduct = items[0].product;
            if (!detectedProduct && items[0].product_id) {
                const { data: pObj } = await supabaseAdmin.from('products').select('*').eq('id', items[0].product_id).single();
                detectedProduct = pObj;
            }
            
            const productName = detectedProduct?.name || items[0].product_name_snapshot || 'Your Cast Director Studio Product';
            const isBYOK = productName.includes('BYOK') || (detectedProduct?.sku && detectedProduct.sku.includes('BYOK'));
            
            const { data: licenses } = await supabaseAdmin.from('licenses').select('*').eq('order_id', entity_id);
            const { data: downloads } = await supabaseAdmin.from('downloads').select('*').eq('order_id', entity_id);

            if (isBYOK && (!licenses || licenses.length === 0)) {
                throw new Error(`CRITICAL INTEGRITY FAILURE: Order #${entity_id} is a BYOK product (${productName}) but no License Keys were found.`);
            }
            if (isBYOK && (!downloads || downloads.length === 0)) {
                throw new Error(`CRITICAL INTEGRITY FAILURE: Order #${entity_id} is a BYOK product (${productName}) but no Downloads were found.`);
            }

            subject = `Your Purchase Receipt [Order #${entity_id.split('-')[0]}]`;
            
            const licHtml = licenses && licenses.length > 0 ? licenses.map((l: any) => `
              <li style="margin-bottom: 8px;">
                <strong>Key:</strong> <code style="background:#eee;padding:2px 4px;">${l.license_key || l.id}</code><br/>
                <span style="font-size:12px;color:#555">Updates Expire: ${l.updates_expires_at ? new Date(l.updates_expires_at).toLocaleDateString() : 'Never'} | Support Expires: ${l.support_expires_at ? new Date(l.support_expires_at).toLocaleDateString() : 'Never'}</span>
              </li>
            `).join('') : '<li>No specific physical licenses attached to this order tier.</li>';

            const dlHtml = downloads && downloads.length > 0 ? downloads.map((d: any) => `
              <li style="margin-bottom: 8px;">
                <a href="https://castdirectorstudio.com/download/${d.id}" style="color:#2563eb;text-decoration:none;font-weight:bold;">Secure Installer Download Link</a>
                <br/><span style="font-size:12px;color:#555">Expires: ${d.expires_at ? new Date(d.expires_at).toLocaleString() : 'Never'}</span>
              </li>
            `).join('') : '<li>No static installers provisioned for this cloud-first order.</li>';

            htmlBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
                <h2 style="border-bottom: 1px solid #ccc; padding-bottom: 8px;">Purchase Receipt</h2>
                <p>Thank you for buying <strong>${productName}</strong> (Order #${entity_id}).</p>
                <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin-top:0;">Your Licenses</h3>
                    <ul style="padding-left: 20px;">${licHtml}</ul>
                </div>
                <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin-top:0;">Your Downloads</h3>
                    <ul style="padding-left: 20px;">${dlHtml}</ul>
                </div>
                <p style="font-size: 14px; color: #666;">View your full account dashboard anytime at <a href="https://castdirectorstudio.com/account">castdirectorstudio.com/account</a></p>
              </div>
            `;
            
            textBody = `Purchase Receipt\n\nThank you for buying ${productName} (Order #${entity_id}).\n\nYour Licenses and Downloads are provisioned.\nPlease log in at castdirectorstudio.com/account to access your secure keys and cloud utilities.`;
            break;
        }
        case 'license_download_details': {
            if (!entity_id) throw new Error('entity_id (order_id) required for license details');
            
            const { data: order, error: oe } = await supabaseAdmin.from('orders').select('*').eq('id', entity_id).single();
            if (oe || !order) throw new Error('Missing associated order context');
            
            const { data: items } = await supabaseAdmin.from('order_items').select('*, product:products(*)').eq('order_id', entity_id);
            if (!items || items.length === 0) throw new Error('Invalid order: parsing items failed.');

            let detectedProduct = items[0].product;
            if (!detectedProduct && items[0].product_id) {
                const { data: pObj } = await supabaseAdmin.from('products').select('*').eq('id', items[0].product_id).single();
                detectedProduct = pObj;
            }
            
            const productName = detectedProduct?.name || items[0].product_name_snapshot || 'Your Premium Access';
            const isBYOK = productName.includes('BYOK') || (detectedProduct?.sku && detectedProduct.sku.includes('BYOK'));

            const { data: licenses } = await supabaseAdmin.from('licenses').select('*').eq('order_id', entity_id);
            const { data: downloads } = await supabaseAdmin.from('downloads').select('*').eq('order_id', entity_id);

            if (isBYOK && (!licenses || licenses.length === 0)) {
                throw new Error(`CRITICAL INTEGRITY FAILURE: Order #${entity_id} is a BYOK product (${productName}) but no License Keys were found.`);
            }
            if (isBYOK && (!downloads || downloads.length === 0)) {
                throw new Error(`CRITICAL INTEGRITY FAILURE: Order #${entity_id} is a BYOK product (${productName}) but no Downloads were found.`);
            }

            subject = `Your License & Download Details [Order #${entity_id.split('-')[0]}]`;
            
            const licHtml = licenses && licenses.length > 0 ? licenses.map((l: any) => `
              <li style="margin-bottom: 12px; font-family: monospace; font-size: 14px;">
                <strong>Activation Key:</strong> <code style="background:#f1f5f9; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold;">${l.license_key || l.id}</code><br/>
                <span style="font-family: sans-serif; font-size:12px; color:#475569;">📍 Updates Active Until: ${l.updates_expires_at ? new Date(l.updates_expires_at).toLocaleDateString() : 'Perpetual'}</span><br/>
                <span style="font-family: sans-serif; font-size:12px; color:#475569;">📍 Support Active Until: ${l.support_expires_at ? new Date(l.support_expires_at).toLocaleDateString() : 'Perpetual'}</span>
              </li>
            `).join('') : '<li>No physical license required. Access is tied to your account login.</li>';

            const dlHtml = downloads && downloads.length > 0 ? downloads.map((d: any) => `
              <li style="margin-bottom: 8px;">
                <a href="https://castdirectorstudio.com/download/${d.id}" style="display:inline-block; background:#0f172a; color:#fff; text-decoration:none; padding:8px 16px; border-radius:4px; font-weight:bold; font-size:14px;">Download Official Installer</a><br/>
                <span style="font-size:11px; color:#64748b; display:inline-block; margin-top:4px;">Link Expires: ${d.expires_at ? new Date(d.expires_at).toLocaleString() : 'Never'}</span>
              </li>
            `).join('') : '<li>No installer attached to this tier. Use the managed cloud portal.</li>';

            htmlBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a; line-height: 1.5;">
                <h2 style="border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px;">License & Download Deliverable</h2>
                <p>Hello,</p>
                <p>Your secure activation packet for <strong>${productName}</strong> is ready. Please follow the instructions below to install and authorize your workstation.</p>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
                    <h3 style="margin-top:0; color: #0f172a;">1. Download Client</h3>
                    <p style="font-size: 13px; color: #475569;">Download and run the installer on your primary creative workstation.</p>
                    <ul style="list-style-type: none; padding-left: 0;">${dlHtml}</ul>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
                    <h3 style="margin-top:0; color: #0f172a;">2. Authorize Software</h3>
                    <p style="font-size: 13px; color: #475569;">Launch the application and enter your Activation Key when prompted.</p>
                    <ul style="list-style-type: none; padding-left: 0;">${licHtml}</ul>
                </div>

                <p style="font-size: 12px; color: #64748b;"><em>Security Notice: Your key is mathematically bound to your seat limit. Do not share your activation key publicly.</em></p>
              </div>
            `;
            
            textBody = `License & Download Deliverable\n\nYour access details for ${productName} are ready.\n\nLog in at castdirectorstudio.com/account to securely authenticate your device.`;
            break;
        }
        case 'subscription_confirmation': {
            if (!entity_id) throw new Error('entity_id (subscription_id) required for subscription confirmation');
            
            const { data: sub, error: se } = await supabaseAdmin.from('subscriptions').select('*').eq('id', entity_id).single();
            if (se || !sub) throw new Error('Missing associated subscription context');

            const productName = 'Cast Director Studio Membership';
            subject = `Subscription Confirmation [Sub #${entity_id.split('-')[0]}]`;
            
            htmlBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
                <h2 style="border-bottom: 1px solid #ccc; padding-bottom: 8px;">Subscription Activated</h2>
                <p>Your <strong>${productName}</strong> has been successfully confirmed and bound to your account.</p>
                <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px; margin: 16px 0;">
                  <strong>Status:</strong> <span style="text-transform: uppercase;">${sub.status || 'Active'}</span><br/>
                  <strong>Current Period Ends:</strong> ${sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'N/A'}<br/>
                </div>
                <h3>Next Steps for Cloud Intelligence</h3>
                <p>Your hosted generation capabilities and secure server compute features have been automatically unlocked. Please restart your desktop client (if open) for the real-time presence checks to validate your tier.</p>
              </div>
            `;
            
            textBody = `Subscription Activated\n\nYour ${productName} (Sub #${entity_id}) is confirmed and ${sub.status}. Your server-powered hosted generation access is now unlocked.`;
            break;
        }
        case 'renewal_confirmation': {
             if (!entity_id) throw new Error('entity_id (subscription_id) required for renewal confirmation');
             
             const { data: sub, error: se } = await supabaseAdmin.from('subscriptions').select('*').eq('id', entity_id).single();
             if (se || !sub) throw new Error('Missing associated subscription context');
             
             // Seek any matching perpetual licenses under this user's email cross-schema
             const { data: orders } = await supabaseAdmin.from('orders').select('id').eq('customer_email', contact.email);
             let licHtml = '<p style="color: #666; font-size: 14px;">(No linked perpetual fallback licenses found requiring update extension.)</p>';
             let textLic = '';
             
             if (orders && orders.length > 0) {
                const { data: lics } = await supabaseAdmin.from('licenses')
                 .select('*')
                 .in('order_id', orders.map((o: any) => o.id))
                 .order('created_at', {ascending: false})
                 .limit(1);
                 
                if (lics && lics.length > 0) {
                    const l = lics[0];
                    licHtml = `
                      <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0;">
                        <h4 style="margin-top:0;">Digital Anchor Updated</h4>
                        <p style="margin:4px 0;"><strong>Updates Now Expire:</strong> ${l.updates_expires_at ? new Date(l.updates_expires_at).toLocaleDateString() : 'Never'}</p>
                        <p style="margin:4px 0;"><strong>Support Now Expires:</strong> ${l.support_expires_at ? new Date(l.support_expires_at).toLocaleDateString() : 'Never'}</p>
                        <p style="font-size: 13px; color: #0284c7; margin-bottom: 0;"><em>Note: No new license key was issued. Your existing primary key dynamically inherited these new expiration timeline validations.</em></p>
                      </div>
                    `;
                    textLic = `Your linked license dates were updated. Updates Expire: ${l.updates_expires_at ? new Date(l.updates_expires_at).toLocaleDateString() : 'Never'}. Support Expires: ${l.support_expires_at ? new Date(l.support_expires_at).toLocaleDateString() : 'Never'}. No new key was issued; your existing key absorbed the extension.`;
                }
             }

             const productName = 'Cast Director Studio Membership Renewal';
             subject = `Subscription Renewal Complete [Sub #${entity_id.split('-')[0]}]`;
             
             htmlBody = `
               <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
                 <h2 style="border-bottom: 1px solid #ccc; padding-bottom: 8px;">Renewal Successful</h2>
                 <p>Your <strong>${productName}</strong> payment has cleared successfully.</p>
                 ${licHtml}
                 <p>Thank you for your continued support!</p>
               </div>
             `;
             
             textBody = `Renewal Successful\n\nYour ${productName} (Sub #${entity_id}) payment has been processed.\n\n${textLic}`;
             break;
        }
        default:
            throw new Error(`Unsupported explicit resend context: ${action}`);
    }

    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error('Internal Configuration Warning: RESEND_API_KEY pipeline detached');

    const resendPayload = {
        from: 'EZ3D Avatars <sales@castdirectorstudio.com>',
        to: [contact.email],
        reply_to: 'support@castdirectorstudio.com',
        subject: subject,
        html: htmlBody,
        text: textBody
    };

    const resendReq = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resendPayload)
    });

    const resendData = await resendReq.json();
    if (!resendReq.ok) {
      throw new Error(`Resend Edge Bounce: ${JSON.stringify(resendData)}`);
    }

    try {
      const { error: dbErr } = await supabaseAdmin.from('email_sends').insert([{
        contact_id: contact.id,
        subject: subject,
        provider_message_id: resendData.id,
        user_id: user.id
      }]);
      if (dbErr) console.warn("Operations Hub Insert Warn:", dbErr.message);
    } catch (e: any) {
      console.warn("Operations Hub Log Bypassed:", e.message);
    }

    return new Response(JSON.stringify({ success: true, messageId: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
