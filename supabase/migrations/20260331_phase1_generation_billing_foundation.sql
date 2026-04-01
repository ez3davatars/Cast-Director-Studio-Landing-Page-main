-- Phase 1 — Production-Safe Generation Billing Foundation
-- Target: Supabase / Postgres
-- Goal: Create a database-backed generation transaction system

-- 1) Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- 2) Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'generation_status') then
    create type public.generation_status as enum (
      'PENDING',
      'COMPLETED',
      'FAILED',
      'CANCELED'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'generation_failure_code') then
    create type public.generation_failure_code as enum (
      'RATE_LIMIT',
      'QUOTA_EXCEEDED',
      'PROVIDER_TIMEOUT',
      'PROVIDER_ERROR',
      'STORAGE_ERROR',
      'VALIDATION_ERROR',
      'INTERNAL_ERROR',
      'SWEPT_STALE',
      'USER_CANCELED'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'credit_transaction_kind') then
    create type public.credit_transaction_kind as enum (
      'GENERATION_DEBIT',
      'GENERATION_REFUND',
      'PURCHASE_CREDIT',
      'MANUAL_ADJUSTMENT'
    );
  end if;
end$$;

-- 3) Harden profiles.credit_balance
-- Confirmed schema: profiles.id matches auth.users.id
alter table public.profiles
  add column if not exists credit_balance integer not null default 0;

-- Ensure only one non-negative constraint exists
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'profiles_credit_balance_nonnegative'
  ) then
    alter table public.profiles
      add constraint profiles_credit_balance_nonnegative
      check (credit_balance >= 0);
  end if;
end$$;

-- 4) Updated-at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 5) generations table
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  status public.generation_status not null default 'PENDING',

  request_idempotency_key text not null,
  request_fingerprint text null,

  generation_type text not null,
  cost integer not null default 1,

  is_byok boolean not null default false,

  provider text null,
  provider_model text null,
  provider_request_id text null,

  asset_url text null,
  asset_storage_path text null,

  error_message text null,
  failure_code public.generation_failure_code null,

  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  failed_at timestamptz null,
  canceled_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint generations_cost_nonnegative check (cost >= 0),
  constraint generations_completion_time_consistency check (
    (status <> 'COMPLETED') or (completed_at is not null)
  ),
  constraint generations_failure_time_consistency check (
    (status <> 'FAILED') or (failed_at is not null)
  ),
  constraint generations_cancel_time_consistency check (
    (status <> 'CANCELED') or (canceled_at is not null)
  )
);

-- Indexes and uniqueness
create unique index if not exists generations_user_idempotency_key_uidx
  on public.generations (user_id, request_idempotency_key);

create index if not exists generations_user_created_at_idx
  on public.generations (user_id, created_at desc);

create index if not exists generations_status_created_at_idx
  on public.generations (status, created_at asc);

create index if not exists generations_failure_code_idx
  on public.generations (failure_code);

create index if not exists generations_generation_type_idx
  on public.generations (generation_type);

-- Trigger
drop trigger if exists trg_generations_set_updated_at on public.generations;

create trigger trg_generations_set_updated_at
before update on public.generations
for each row
execute function public.set_updated_at();

-- 6) credit_transactions table
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid null references public.generations(id) on delete set null,

  kind public.credit_transaction_kind not null,

  amount integer not null,
  balance_before integer null,
  balance_after integer null,

  reason text null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- Constraints and indexes
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'credit_transactions_amount_nonzero'
  ) then
    alter table public.credit_transactions
      add constraint credit_transactions_amount_nonzero
      check (amount <> 0);
  end if;
end$$;

create index if not exists credit_transactions_user_created_at_idx
  on public.credit_transactions (user_id, created_at desc);

create index if not exists credit_transactions_generation_id_idx
  on public.credit_transactions (generation_id);

create index if not exists credit_transactions_kind_idx
  on public.credit_transactions (kind);

-- 7) RPC: start_generation(...)
create or replace function public.start_generation(
  p_user_id uuid,
  p_request_idempotency_key text,
  p_request_fingerprint text,
  p_generation_type text,
  p_cost integer,
  p_is_byok boolean,
  p_provider text default null,
  p_provider_model text default null
)
returns public.generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.generations;
  v_created public.generations;
  v_balance_before integer;
  v_balance_after integer;
begin
  if p_request_idempotency_key is null or btrim(p_request_idempotency_key) = '' then
    raise exception 'request_idempotency_key is required';
  end if;

  if p_generation_type is null or btrim(p_generation_type) = '' then
    raise exception 'generation_type is required';
  end if;

  if p_cost < 0 then
    raise exception 'cost must be >= 0';
  end if;

  -- Idempotency fast-path
  select *
  into v_existing
  from public.generations
  where user_id = p_user_id
    and request_idempotency_key = p_request_idempotency_key
  limit 1;

  if found then
    return v_existing;
  end if;

  -- Wallet lock and mutation (ONLY for HOSTED)
  if not p_is_byok then
    select credit_balance
    into v_balance_before
    from public.profiles
    where id = p_user_id
    for update;

    if v_balance_before is null then
      raise exception 'profile not found for user';
    end if;

    if v_balance_before < p_cost then
      raise exception 'insufficient credits';
    end if;

    update public.profiles
    set credit_balance = credit_balance - p_cost
    where id = p_user_id
    returning credit_balance into v_balance_after;
  end if;

  insert into public.generations (
    user_id,
    status,
    request_idempotency_key,
    request_fingerprint,
    generation_type,
    cost,
    is_byok,
    provider,
    provider_model,
    started_at
  )
  values (
    p_user_id,
    'PENDING',
    p_request_idempotency_key,
    p_request_fingerprint,
    p_generation_type,
    p_cost,
    p_is_byok,
    p_provider,
    p_provider_model,
    now()
  )
  returning * into v_created;

  -- Ledger row (ONLY for HOSTED and cost > 0)
  if not p_is_byok and p_cost > 0 then
    insert into public.credit_transactions (
      user_id,
      generation_id,
      kind,
      amount,
      balance_before,
      balance_after,
      reason,
      metadata
    )
    values (
      p_user_id,
      v_created.id,
      'GENERATION_DEBIT',
      -p_cost,
      v_balance_before,
      v_balance_after,
      'Hosted generation debit',
      jsonb_build_object(
        'request_idempotency_key', p_request_idempotency_key,
        'generation_type', p_generation_type,
        'provider', p_provider,
        'provider_model', p_provider_model
      )
    );
  end if;

  return v_created;
exception
  when unique_violation then
    select *
    into v_existing
    from public.generations
    where user_id = p_user_id
      and request_idempotency_key = p_request_idempotency_key
    limit 1;

    if found then
      return v_existing;
    end if;

    raise;
end;
$$;

-- 8) RPC: complete_generation(...)
create or replace function public.complete_generation(
  p_generation_id uuid,
  p_asset_url text,
  p_asset_storage_path text,
  p_provider_request_id text default null
)
returns public.generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generation public.generations;
begin
  select *
  into v_generation
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'generation not found';
  end if;

  if v_generation.status = 'COMPLETED' then
    return v_generation;
  end if;

  if v_generation.status <> 'PENDING' then
    raise exception 'only pending generations can be completed';
  end if;

  update public.generations
  set
    status = 'COMPLETED',
    asset_url = p_asset_url,
    asset_storage_path = p_asset_storage_path,
    provider_request_id = coalesce(p_provider_request_id, provider_request_id),
    completed_at = now(),
    failed_at = null,
    canceled_at = null,
    error_message = null,
    failure_code = null
  where id = p_generation_id
  returning * into v_generation;

  return v_generation;
end;
$$;

-- 9) RPC: fail_generation(...)
create or replace function public.fail_generation(
  p_generation_id uuid,
  p_failure_code public.generation_failure_code,
  p_error_message text default null
)
returns public.generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generation public.generations;
  v_balance_before integer;
  v_balance_after integer;
begin
  select *
  into v_generation
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'generation not found';
  end if;

  if v_generation.status = 'FAILED' then
    return v_generation;
  end if;

  if v_generation.status <> 'PENDING' then
    raise exception 'only pending generations can be failed';
  end if;

  -- Refund logic (ONLY for HOSTED and cost > 0)
  if not v_generation.is_byok and v_generation.cost > 0 then
    select credit_balance
    into v_balance_before
    from public.profiles
    where id = v_generation.user_id
    for update;

    if v_balance_before is null then
      raise exception 'profile not found for user';
    end if;

    update public.profiles
    set credit_balance = credit_balance + v_generation.cost
    where id = v_generation.user_id
    returning credit_balance into v_balance_after;
  end if;

  update public.generations
  set
    status = 'FAILED',
    failure_code = p_failure_code,
    error_message = p_error_message,
    failed_at = now(),
    completed_at = null,
    canceled_at = null
  where id = p_generation_id
  returning * into v_generation;

  -- Ledger refund row (ONLY for HOSTED and cost > 0)
  if not v_generation.is_byok and v_generation.cost > 0 then
    insert into public.credit_transactions (
      user_id,
      generation_id,
      kind,
      amount,
      balance_before,
      balance_after,
      reason,
      metadata
    )
    values (
      v_generation.user_id,
      v_generation.id,
      'GENERATION_REFUND',
      v_generation.cost,
      v_balance_before,
      v_balance_after,
      'Hosted generation refund',
      jsonb_build_object(
        'failure_code', p_failure_code,
        'request_idempotency_key', v_generation.request_idempotency_key,
        'generation_type', v_generation.generation_type
      )
    );
  end if;

  return v_generation;
end;
$$;

-- 10) Permissions
revoke all on function public.start_generation(
  uuid, text, text, text, integer, boolean, text, text
) from public, anon, authenticated;

revoke all on function public.complete_generation(
  uuid, text, text, text
) from public, anon, authenticated;

revoke all on function public.fail_generation(
  uuid, public.generation_failure_code, text
) from public, anon, authenticated;

-- 11) Support views
create or replace view public.failed_generations_support_view as
select
  g.id,
  g.user_id,
  g.generation_type,
  g.is_byok,
  g.cost,
  g.failure_code,
  g.error_message,
  g.provider,
  g.provider_model,
  g.created_at,
  g.failed_at
from public.generations g
where g.status = 'FAILED';

create or replace view public.pending_generations_support_view as
select
  g.id,
  g.user_id,
  g.generation_type,
  g.is_byok,
  g.cost,
  g.provider,
  g.provider_model,
  g.created_at,
  g.started_at
from public.generations g
where g.status = 'PENDING';
