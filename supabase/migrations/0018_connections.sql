-- Per-org PROVIDER connections: each org brings its OWN calling (Bland) and email
-- (Resend) credentials, so every business uses and pays for its own accounts.
--
-- This is deliberately SEPARATE from integration_tokens (migration 0001/0008),
-- which is OAuth-shaped (access_token/refresh_token, token_type, expiry) and
-- drives the CRM authorization-code flow. API-key providers don't fit that shape,
-- so they get their own purpose-built table.
--
-- SECURITY MODEL (same defense-in-depth as integration_tokens):
--   * encrypted_credentials holds a Fernet ciphertext of a small JSON blob
--     ({"api_key": "...", "from_email": "..."}), encrypted by FastAPI with
--     TOKEN_ENCRYPTION_KEY BEFORE it ever reaches Postgres. The plaintext key
--     never touches the database.
--   * key_hint is a NON-secret masked hint (e.g. "re_...cd12") that the frontend
--     may display so a user recognises which key is stored — never the full key.
--   * RLS scopes every row to the caller's org (org_id in user_org_ids()), so no
--     org can read or write another org's connection. Even a member reading the
--     table directly over PostgREST only ever sees ciphertext they cannot decrypt
--     (the Fernet key is server-side only).
--
-- Tenancy is identical to org_settings / knowledge_base: one row per (org, service),
-- visible and writable only to members of that org. FastAPI talks to it in USER
-- mode on the request path (so RLS is the real boundary) and in SERVICE mode with
-- an explicit org_id when a background sweep resolves an org's key to place a call
-- or send an email.

create extension if not exists pgcrypto;

create table if not exists public.connections (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null
                          references public.organizations(id) on delete cascade,
  service               text not null
                          check (service in ('bland', 'resend')),
  encrypted_credentials text not null,            -- Fernet ciphertext (never plaintext)
  key_hint              text,                      -- masked, non-secret (safe to show)
  from_email            text,                      -- Resend sender; NON-secret, for display
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (org_id, service)                         -- one connection per provider per org
);

create index if not exists connections_org_idx on public.connections (org_id);

-- Keep updated_at fresh on every UPDATE (public.touch_updated_at() defined in 0009).
drop trigger if exists connections_touch_updated_at on public.connections;
create trigger connections_touch_updated_at
  before update on public.connections
  for each row execute function public.touch_updated_at();

-- Table privileges (RLS still decides WHICH rows). Mirrors the 0008/0012 pattern.
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.connections to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.connections to service_role;
  end if;
end $do$;

-- Row-level security: strict per-org isolation, identical shape to org_settings.
alter table public.connections enable row level security;
drop policy if exists "no_public_access" on public.connections;
drop policy if exists "org_isolation"    on public.connections;
create policy "org_isolation" on public.connections
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
