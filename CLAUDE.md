# Cast Director Studio CRM — Affiliate Dashboard Instructions

Architecture:
- Supabase is the CRM backend.
- Stripe is the billing/payment source of truth.
- Supabase Edge Functions handle privileged backend logic.
- The frontend must never use Supabase service-role keys.
- Stripe secret keys must never appear in frontend code.
- Stripe webhooks must verify Stripe signatures.
- Stripe webhook processing must be idempotent.
- Commission records must be ledger-style and immutable.
- Refunds or chargebacks must create reversal rows, not overwrite historical commission rows.

Affiliate MVP:
- Build internal CRM affiliate management first.
- Build affiliate-facing dashboard second.
- Start with manual payout approval.
- Do not add Stripe Connect yet.
- Do not add multi-level affiliates.
- Do not add a public affiliate marketplace.

Commission defaults:
- 30% recurring commission.
- 12-month commission duration.
- 60-day attribution window.
- 30-day payout hold.
- $50 minimum payout.
- Last-click attribution.
- No commission on taxes, refunds, failed payments, disputes, chargebacks, or self-referrals.

Required tables:
- affiliates
- affiliate_links
- affiliate_clicks
- referrals
- commission_ledger
- payout_batches
- payout_items
- stripe_webhook_events
- affiliate_assets
- affiliate_notes

Required Edge Functions:
- record-affiliate-click
- create-checkout-session
- stripe-webhook

Rules:
- Inspect the existing repo before editing.
- Reuse existing auth, profile, organization, role, and CRM patterns.
- Do not create a separate auth system.
- Do not bypass the existing team/org/tenant structure.
- Write database migrations.
- Do not manually change production Supabase.
- Do not run supabase db push without explicit approval.
- Do not deploy Edge Functions without explicit approval.
- Do not read .env or secret files unless explicitly instructed.
- After each pass, summarize modified files, commands run, and remaining risks.