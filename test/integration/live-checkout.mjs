#!/usr/bin/env node
/**
 * Live integration check against the locally-running Supabase + Stripe test-mode
 * stack. NOT part of `npm test` (kept out so the unit suite passes offline).
 *
 * It verifies, end to end, that the authoritative create-checkout-session Edge
 * Function honours the website contract:
 *   - subscription_starter -> cs_test_ subscription session
 *   - subscription_pro     -> cs_test_ subscription session
 *   - stale key            -> rejected (UNKNOWN_PRODUCT)
 *   - guest (anon only)    -> rejected (auth required)
 *
 * Requirements:
 *   - The local stack reachable at SUPABASE_URL (default http://127.0.0.1:54321).
 *   - A SERVICE_ROLE key (env SUPABASE_SERVICE_ROLE_KEY) to admin-create a
 *     confirmed test user. Without it, the script skips (exit 0) so it never
 *     blocks an offline run.
 *
 * Env overrides: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const EMAIL = process.env.TEST_EMAIL || 'cds-checkout-test@example.com';
const PASSWORD = process.env.TEST_PASSWORD || 'Test-Passw0rd!';
const CHECKOUT = `${SUPABASE_URL}/functions/v1/create-checkout-session`;

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  failures++;
  console.error(`  ✗ ${m}`);
};

async function reachable() {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureUser() {
  // Admin-create a confirmed user (idempotent: 200 created, 422 already exists).
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
}

async function signIn() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign-in failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function checkout(productKey, bearer) {
  const r = await fetch(CHECKOUT, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productKey, return_url: 'http://127.0.0.1:3000/get-started' }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

async function main() {
  if (!(await reachable())) {
    console.log('Local Supabase not reachable at', SUPABASE_URL, '— skipping live integration.');
    process.exit(0);
  }
  if (!SERVICE_ROLE) {
    console.log('SUPABASE_SERVICE_ROLE_KEY not set — skipping live integration.');
    process.exit(0);
  }

  console.log('Live checkout integration against', SUPABASE_URL);
  await ensureUser();
  const token = await signIn();

  // Starter -> cs_test_ subscription session.
  const starter = await checkout('subscription_starter', token);
  if (starter.status === 200 && String(starter.body.session_id).startsWith('cs_test_')) {
    ok(`subscription_starter -> ${starter.body.session_id.slice(0, 18)}...`);
  } else {
    fail(`subscription_starter expected cs_test_ session, got ${JSON.stringify(starter)}`);
  }

  // Pro -> cs_test_ subscription session.
  const pro = await checkout('subscription_pro', token);
  if (pro.status === 200 && String(pro.body.session_id).startsWith('cs_test_')) {
    ok(`subscription_pro -> ${pro.body.session_id.slice(0, 18)}...`);
  } else {
    fail(`subscription_pro expected cs_test_ session, got ${JSON.stringify(pro)}`);
  }

  // Stale key rejected.
  const stale = await checkout('starter_monthly', token);
  if (stale.status >= 400 && stale.body.code === 'UNKNOWN_PRODUCT') {
    ok('stale key starter_monthly rejected (UNKNOWN_PRODUCT)');
  } else {
    fail(`stale key should be rejected, got ${JSON.stringify(stale)}`);
  }

  // Guest (anon only) rejected — no unauthenticated subscription checkout.
  const guest = await checkout('subscription_starter', ANON);
  if (guest.status === 401) {
    ok('guest subscription checkout rejected (401)');
  } else {
    fail(`guest checkout should be 401, got ${JSON.stringify(guest)}`);
  }

  console.log('');
  if (failures > 0) {
    console.error(`Integration FAILED: ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('Integration PASSED.');
}

main().catch((e) => {
  console.error('Integration error:', e);
  process.exit(1);
});
