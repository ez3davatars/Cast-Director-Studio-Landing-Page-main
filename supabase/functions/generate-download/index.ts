// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { S3Client, GetObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.540.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.540.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // 1. Handle Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { download_id } = await req.json();

    if (!download_id) {
      return new Response(
        JSON.stringify({ error: "missing_id", message: "No download ID provided." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Safely bootstrap Service Role DB Client mapped specifically for internal validations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Resolve Download Tracking Row and joined Product Config
    const { data: download, error: dbErr } = await supabaseAdmin
      .from('downloads')
      .select('*, product:products(*)')
      .eq('id', download_id)
      .maybeSingle();

    if (dbErr || !download) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "This download link is invalid or does not exist." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validate Physical Expiry Boundaries
    if (download.expires_at) {
        const expiresAt = new Date(download.expires_at);
        const now = new Date();
        if (expiresAt < now) {
            return new Response(
              JSON.stringify({ error: "expired_link", message: "This download link has expired." }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
    }

    // 5. Explicit Missing Installer Handling
    const product = download.product || {};
    const installerObjectKey = product.installer_object_key;
    
    if (!installerObjectKey) {
        // As defined by rule 3: strict installer mapping checking
        console.error(`[Edge Download] Missing installer_object_key for Product ${product.id}`);
        return new Response(
            JSON.stringify({ error: "missing_installer", message: "This installer is not available yet." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // 6. Connect to Cloudflare R2 and generate S3 Compliant V4 Signed URL
    const r2AccountId = Deno.env.get("R2_ACCOUNT_ID");
    const r2AccessKey = Deno.env.get("R2_ACCESS_KEY_ID");
    const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const r2Bucket = Deno.env.get("R2_BUCKET_NAME");

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
        console.error("[CRITICAL] Missing Edge Environment variables for Cloudflare R2 Gateway");
        return new Response(
            JSON.stringify({ error: "config_error", message: "Delivery infrastructure is misconfigured." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: r2AccessKey,
            secretAccessKey: r2SecretKey,
        },
    });

    const command = new GetObjectCommand({
        Bucket: r2Bucket,
        Key: installerObjectKey,
    });

    // Generate strict short-lived 5 minute URL
    const targetUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    // 7. Success - Hand back the presigned URL boundary securely.
    return new Response(
      JSON.stringify({ targetUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[Fatal] Edge Download Minting crashed:`, error);
    return new Response(
        JSON.stringify({ error: "internal_error", message: "An unexpected architecture fault occurred." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
