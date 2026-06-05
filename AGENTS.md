# Cast Director Studio CRM — Codex Instructions

## Project context

This repo is the Cast Director Studio CRM / landing page app.

Stack:
- React + TypeScript + Vite
- React Router v6
- Supabase JS v2
- Supabase Auth
- Supabase Edge Functions
- Stripe Checkout/Billing/Webhooks

Auth:
- Admin users are identified by:
  session.user.app_metadata.is_admin === true
- In SQL/RLS:
  (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
- There is no org/team/tenant layer.
- Affiliate users are identified by a row in public.affiliates where user_id = auth.uid().

Important current state:
- Branch: feature/affiliate-dashboard
- Phase A/B/B.1/C/C.1 affiliate work has been generated.
- Nothing should be deployed to production.
- We are testing against a new free Supabase dev project, not production.
- Docker is not being used.

## Current problem

A fresh Supabase dev project is replaying all migrations from zero.

The migration push failed because older migrations create RLS policies on tables before those tables exist.

Already fixed:
- public.contacts in 20260320000002_admin_metrics_rls.sql was guarded with to_regclass('public.contacts').

Current known failure:
- 20260320000003_admin_emails_rls.sql tries to create a policy on public.email_sends before the email_sends table exists.

## Main task

Make the repo's full migration history replay safely on a fresh Supabase dev project.

Do not create fake placeholder tables.
Do not rename migration files.
Do not squash migrations.
Do not delete old migrations.
Do not weaken RLS.
Do not expose affiliate_clicks raw data.
Do not expose affiliate_assets to all authenticated users.
Do not touch production.
Do not deploy Edge Functions unless explicitly approved.
Do not read .env.local secrets unless explicitly approved.

## Required migration compatibility pattern

For any CREATE POLICY, trigger, index, or table-specific operation on a table that may not exist yet, guard it:

IF to_regclass('public.table_name') IS NOT NULL THEN
  ...
END IF;

For policies, also check pg_policies before creating:

IF to_regclass('public.table_name') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'table_name'
       AND policyname = 'Policy name'
   ) THEN
  CREATE POLICY ...
END IF;

## Backfill migration rule

If an old policy migration is skipped because the target table does not exist yet, add a later idempotent backfill migration after all current migrations.

Preferred file:
supabase/migrations/20260606000008_fresh_dev_policy_backfill.sql

The backfill migration should:
- use to_regclass checks
- use pg_policies checks
- enable RLS where appropriate
- not fail if a table is absent
- not duplicate policies
- not weaken affiliate RLS
- not expose raw affiliate_clicks
- not expose affiliate_assets to all authenticated users

## Affiliate data security rules

- affiliate_clicks raw rows are admin-only.
- affiliates use get_affiliate_dashboard_stats() for aggregate stats.
- affiliate_assets are readable only by admins and active affiliates.
- commission_ledger is append-only except payout_batch_id/payout_item_id assignment.
- Stripe webhook affiliate logic must be non-blocking.
- Refunds create reversal ledger rows, not destructive edits.

## Commands

Safe commands Codex may run:
- git status
- git diff
- git --no-pager diff
- npm run lint
- npm run build
- npx supabase db push --linked --dry-run

Ask before running:
- npx supabase db push --linked
- npx supabase functions deploy
- npx supabase secrets set
- git push
- any destructive command