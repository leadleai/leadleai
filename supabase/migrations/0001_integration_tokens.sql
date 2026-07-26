-- OAuth token storage for external platform integrations.
-- Tokens are AES-GCM encrypted by the Edge Function before insert, and RLS
-- ensures a user can only ever see/delete their own rows. Only the service
-- role (used inside the oauth-callback Edge Function) can insert/update tokens.

create extension if not exists pgcrypto;

create table if not exists public.integration_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform      text not null,
  access_token  text not null,          -- AES-GCM ciphertext (never plaintext)
  refresh_token text,                    -- AES-GCM ciphertext
  token_type    text default 'Bearer',
  scope         text,
  expires_at    timestamptz,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, platform)
);

alter table public.integration_tokens enable row level security;

-- Users may read their own connections (client only ever selects the non-secret
-- columns; the token columns are encrypted anyway).
drop policy if exists "own_connections_select" on public.integration_tokens;
create policy "own_connections_select"
  on public.integration_tokens for select
  to authenticated
  using (auth.uid() = user_id);

-- Users may disconnect (delete) their own connections.
drop policy if exists "own_connections_delete" on public.integration_tokens;
create policy "own_connections_delete"
  on public.integration_tokens for delete
  to authenticated
  using (auth.uid() = user_id);

-- NOTE: there is intentionally NO insert/update policy for regular users.
-- Writing tokens is done exclusively by the oauth-callback Edge Function using
-- the service-role key, which bypasses RLS.

create index if not exists integration_tokens_user_idx
  on public.integration_tokens (user_id);
