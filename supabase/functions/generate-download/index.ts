// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";


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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Missing authorization header." }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid authorization token." }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Resolve Download Tracking Row and joined Installer Config
    const { data: download, error: dbErr } = await supabaseAdmin
      .from('downloads')
      .select('*, installer:installers(*)')
      .eq('id', download_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbErr || !download) {
      return new Response(
        JSON.stringify({ error: "DOWNLOAD_NOT_FOUND", message: "This download link is invalid or does not exist." }),
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

    // 4b. Validate Download Limits
    if (download.max_downloads !== null && download.max_downloads !== undefined && download.download_count >= download.max_downloads) {
        return new Response(
            JSON.stringify({ error: "limit_reached", message: "This download link has reached its maximum allowed downloads." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // 5. Explicit Missing Installer Handling
    const installer = download.installer || {};
    const installerObjectKey = installer.storage_path;
    
    if (!installerObjectKey) {
        console.error(`[Edge Download] Missing storage_path for Installer ${installer.id}`);
        return new Response(
            JSON.stringify({ error: "INSTALLER_STORAGE_PATH_MISSING", message: "This installer is not available yet." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // 6. Connect to Cloudflare R2 and generate S3 Compliant V4 Signed URL
    const r2AccountId = Deno.env.get("CLOUDFLARE_R2_ACCOUNT_ID");
    const r2AccessKey = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID");
    const r2SecretKey = Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
    const r2Bucket = Deno.env.get("CLOUDFLARE_R2_BUCKET_DOWNLOADS");
    const r2Endpoint = Deno.env.get("CLOUDFLARE_R2_ENDPOINT");

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket || !r2Endpoint) {
        console.error("[CRITICAL] Missing Edge Environment variables for Cloudflare R2 Gateway");
        return new Response(
            JSON.stringify({ error: "R2_CONFIG_MISSING", message: "Delivery infrastructure is misconfigured." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const s3 = new S3Client({
        region: "auto",
        endpoint: r2Endpoint,
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

    // Increment download tracking
    await supabaseAdmin
        .from('downloads')
        .update({ download_count: (download.download_count || 0) + 1 })
        .eq('id', download_id);

    // Extract filename from storage path
    const filename = installerObjectKey.split('/').pop() || download.display_name || "installer.exe";

    // 7. Success - Hand back the presigned URL boundary securely.
    return new Response(
      JSON.stringify({ 
          url: targetUrl,
          filename: filename,
          version: installer.version || "1.0.0",
          expiresInSeconds: 300
      }),
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
