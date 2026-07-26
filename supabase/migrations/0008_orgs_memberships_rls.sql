-- ============================================================================
-- Multi-tenancy: organizations, memberships, invites, and org_id on every
-- tenant table — plus the RLS policies that make isolation a DATABASE
-- guarantee rather than an application convention.
--
-- Run this whole file once (Supabase SQL editor or `supabase db push`).
-- It is idempotent: re-running it is safe.
--
-- STRICT ORDERING (nothing here may reference something defined later):
--   0. preflight        — prerequisites exist; relax function-body validation
--   1. tenancy tables   — organizations, memberships, invites
--   2. helper functions — user_org_ids(), is_org_owner()   [need part 1]
--   3. org_id columns   — on the tenant tables             [need part 1]
--   4. RLS + policies   — every policy calls part 2        [need parts 1-3]
--   5. signup trigger   — writes to part 1 tables
--   6. backfill         — fills org_id added in part 3
--   7. constraints      — NOT NULL / composite keys        [need part 6]
--
-- Read part 6 before running on a database that already has data.
-- ============================================================================

create extension if not exists pgcrypto;


-- ── 0. Preflight ────────────────────────────────────────────────────────────

-- A SQL-language function's body is parsed and resolved WHEN IT IS CREATED, so
-- `user_org_ids()` would fail with 42P01 if it were ever evaluated before
-- `memberships` exists. Part 1 runs first so that can't happen here — but
-- turning validation off makes the file immune to it regardless of how an
-- editor or tool reorders/reformats the statements. Restored in part 7.
set check_function_bodies = off;

-- Tables from earlier migrations that this one alters. `integration_tokens`
-- comes from 0001; if 0001 was never applied it is created here in its final
-- shape, because the integrations API now depends on it.
create table if not exists public.integration_tokens (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable: records WHO connected it. Ownership is org_id (added in part 3).
  user_id       uuid references auth.users(id) on delete set null,
  platform      text not null,
  access_token  text not null,          -- encrypted ciphertext, never plaintext
  refresh_token text,                    -- encrypted ciphertext
  token_type    text default 'Bearer',
  scope         text,
  expires_at    timestamptz,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists integration_tokens_user_idx
  on public.integration_tokens (user_id);

-- Fail loudly and specifically if a prerequisite is still missing, instead of
-- surfacing a bare "relation does not exist" from somewhere in part 3.
do $do$
declare
  missing text[] := '{}';
  t       text;
begin
  foreach t in array array['leads','email_log','call_log','email_templates'] loop
    if to_regclass('public.' || t) is null then
      missing := missing || t;
    end if;
  end loop;

  if cardinality(missing) > 0 then
    raise exception
      'Missing prerequisite table(s): %. Apply the earlier migrations first '
      '(0002_leads, 0006_email_log_and_templates, 0007_call_log), then re-run this file.',
      array_to_string(missing, ', ');
  end if;

  -- Part 4 creates policies `to authenticated`, which requires that role to
  -- exist. Check it here so a plain-Postgres run fails with a clear message
  -- instead of a cryptic "role does not exist" halfway through.
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception
      'Role "authenticated" does not exist. This migration targets Supabase, '
      'which provides the anon/authenticated/service_role roles.';
  end if;
end $do$;


-- ── 1. Core tenancy tables ──────────────────────────────────────────────────
-- FIRST, because parts 2-7 all reference these.

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Public, non-secret identifier used by the enquiry form URL (/enquiry/:slug).
  -- Safe to expose: knowing a slug only lets you SUBMIT a lead to that org,
  -- never read one.
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_org_idx  on public.memberships (org_id);

-- Pending invitations. Lets an owner invite someone who has no account yet:
-- when they sign up, the trigger in part 5 joins them to the inviting org
-- instead of creating a fresh one.
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('owner','member')),
  invited_by  uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);

create index if not exists invites_email_idx on public.invites (lower(email));

-- Table-level privileges. RLS decides WHICH ROWS you see; GRANT decides whether
-- you may touch the table at all — without these, PostgREST returns
-- "permission denied for table organizations" instead of an empty result.
-- Supabase's default privileges usually cover this, but granting explicitly
-- makes the migration self-sufficient. Note `anon` is deliberately NOT granted:
-- the public enquiry form reaches these tables only through FastAPI's
-- service-role key, never directly.
-- `authenticated` is guaranteed by the preflight check above; `service_role`
-- is probed because self-hosted setups occasionally omit it. Granting the same
-- privilege twice is a no-op, so this is safe on every re-run.
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete
      on public.organizations, public.memberships, public.invites, public.integration_tokens
      to authenticated;
  else
    raise notice 'role "authenticated" not found — skipping grants (expected outside Supabase)';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all
      on public.organizations, public.memberships, public.invites, public.integration_tokens
      to service_role;
  end if;
end $do$;


-- ── 2. The membership helpers (the keystone of every policy) ────────────────
-- AFTER part 1: both function bodies read public.memberships.
--
-- SECURITY DEFINER is REQUIRED here. A policy on `memberships` that queried
-- `memberships` directly would recurse infinitely; because these functions are
-- definer-owned they bypass RLS internally and break the cycle.
-- `stable` lets the planner cache them per statement.

create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select org_id from public.memberships where user_id = auth.uid()
$fn$;

-- True when the caller is an OWNER of the given org (used for team management).
create or replace function public.is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org and role = 'owner'
  )
$fn$;

-- Lock both helpers down: not callable by the world, callable by signed-in
-- users (the policies in part 4 invoke them). Re-running is a no-op.
revoke all on function public.user_org_ids()        from public;
revoke all on function public.is_org_owner(uuid)    from public;

do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.user_org_ids()     to authenticated;
    grant execute on function public.is_org_owner(uuid) to authenticated;
  end if;
end $do$;


-- ── 3. org_id on every tenant table ─────────────────────────────────────────
-- AFTER part 1: each column has an FK to public.organizations.
-- Added nullable here; part 6 backfills and part 7 enforces NOT NULL.

alter table public.leads              add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.email_log          add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.call_log           add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.email_templates    add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.integration_tokens add column if not exists org_id uuid references public.organizations(id) on delete cascade;

create index if not exists leads_org_idx              on public.leads (org_id);
create index if not exists email_log_org_idx          on public.email_log (org_id);
create index if not exists call_log_org_idx           on public.call_log (org_id);
create index if not exists email_templates_org_idx    on public.email_templates (org_id);
create index if not exists integration_tokens_org_idx on public.integration_tokens (org_id);

-- email_templates was keyed by `step` alone, which would let one org's template
-- collide with another's. Drop ONLY the old single-column key — if a previous
-- run already installed the composite (org_id, step) key, leave it alone so a
-- re-run never leaves the table without a primary key.
do $do$
declare
  pk_columns int;
begin
  select cardinality(conkey) into pk_columns
  from pg_constraint
  where conrelid = 'public.email_templates'::regclass and contype = 'p';

  if pk_columns = 1 then
    alter table public.email_templates drop constraint email_templates_pkey;
    raise notice 'email_templates: dropped single-column primary key (re-added as (org_id, step) in part 7)';
  end if;
end $do$;

-- integration_tokens was unique on (user_id, platform); a connection now
-- belongs to the ORG, so one Sangam/Gmail connection is shared by the team.
do $do$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'integration_tokens_user_id_platform_key'
      and conrelid = 'public.integration_tokens'::regclass
  ) then
    alter table public.integration_tokens drop constraint integration_tokens_user_id_platform_key;
  end if;
end $do$;

-- user_id becomes "who connected it", not the owner. (No-op when this table was
-- just created above, since it is already nullable there.)
alter table public.integration_tokens alter column user_id drop not null;


-- ── 4. Row-Level Security ───────────────────────────────────────────────────
-- AFTER parts 1-3: every policy references org_id (part 3) and calls
-- user_org_ids()/is_org_owner() (part 2).
--
-- One permissive policy per tenant table: you may touch a row only when its
-- org_id is one of YOUR orgs. `with check` applies the same rule to writes, so
-- a user cannot insert or move a row into an org they don't belong to.
--
-- These grant to `authenticated` only. `anon` gets nothing: the public enquiry
-- form does not talk to Postgres directly, it POSTs to FastAPI, which inserts
-- with the service-role key after resolving the org from the form slug.
--
-- The old blanket "no_public_access" policies are dropped: Postgres OR's
-- permissive policies together, so leaving a `using (false)` policy in place
-- would be dead weight and misleading.

-- organizations
alter table public.organizations enable row level security;
drop policy if exists "org_members_select" on public.organizations;
create policy "org_members_select" on public.organizations
  for select to authenticated
  using (id in (select public.user_org_ids()));

drop policy if exists "org_owners_update" on public.organizations;
create policy "org_owners_update" on public.organizations
  for update to authenticated
  using (public.is_org_owner(id))
  with check (public.is_org_owner(id));

-- memberships: you can see everyone in your orgs; only owners can add/remove.
alter table public.memberships enable row level security;
drop policy if exists "membership_select" on public.memberships;
create policy "membership_select" on public.memberships
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

drop policy if exists "membership_owner_write" on public.memberships;
create policy "membership_owner_write" on public.memberships
  for all to authenticated
  using (public.is_org_owner(org_id))
  with check (public.is_org_owner(org_id));

-- invites: visible to the org; writable by owners.
alter table public.invites enable row level security;
drop policy if exists "invite_select" on public.invites;
create policy "invite_select" on public.invites
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

drop policy if exists "invite_owner_write" on public.invites;
create policy "invite_owner_write" on public.invites
  for all to authenticated
  using (public.is_org_owner(org_id))
  with check (public.is_org_owner(org_id));

-- leads
alter table public.leads enable row level security;
drop policy if exists "no_public_access" on public.leads;
drop policy if exists "org_isolation" on public.leads;
create policy "org_isolation" on public.leads
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- email_log
alter table public.email_log enable row level security;
drop policy if exists "no_public_access" on public.email_log;
drop policy if exists "org_isolation" on public.email_log;
create policy "org_isolation" on public.email_log
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- call_log
alter table public.call_log enable row level security;
drop policy if exists "no_public_access" on public.call_log;
drop policy if exists "org_isolation" on public.call_log;
create policy "org_isolation" on public.call_log
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- email_templates
alter table public.email_templates enable row level security;
drop policy if exists "no_public_access" on public.email_templates;
drop policy if exists "org_isolation" on public.email_templates;
create policy "org_isolation" on public.email_templates
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- integration_tokens: org-scoped now, replacing the old per-user policies.
alter table public.integration_tokens enable row level security;
drop policy if exists "own_connections_select" on public.integration_tokens;
drop policy if exists "own_connections_delete" on public.integration_tokens;
drop policy if exists "org_isolation" on public.integration_tokens;
create policy "org_isolation" on public.integration_tokens
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));


-- ── 5. Auto-provision an org on signup ──────────────────────────────────────
-- AFTER part 1: the body inserts into organizations / memberships / invites.
--
-- Fires for every new auth.users row (email/password AND Google OAuth).
--   * If the email has a pending invite -> join THAT org (no personal org).
--   * Otherwise -> create a personal org and make them its owner.
-- A solo user is simply an org with one member.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  invite      public.invites%rowtype;
  new_org_id  uuid;
  base_slug   text;
  candidate   text;
  suffix      int := 0;
  display     text;
begin
  select * into invite
  from public.invites
  where lower(email) = lower(new.email) and accepted_at is null
  order by created_at
  limit 1;

  if found then
    insert into public.memberships (org_id, user_id, role)
    values (invite.org_id, new.id, invite.role)
    on conflict (org_id, user_id) do nothing;

    update public.invites set accepted_at = now() where id = invite.id;
    return new;
  end if;

  -- Personal org. Name from the OAuth profile when present, else the email.
  display := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, 'workspace'), '@', 1)
  );

  base_slug := regexp_replace(lower(split_part(coalesce(new.email, 'org'), '@', 1)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug is null or base_slug = '' then
    base_slug := 'org';
  end if;

  candidate := base_slug;
  while exists (select 1 from public.organizations where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  insert into public.organizations (name, slug)
  values (display || '''s workspace', candidate)
  returning id into new_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end $fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── 6. BACKFILL — read before running on a database with existing data ──────
-- AFTER part 3: fills the org_id columns it added.
--
-- Existing leads/emails/calls/templates have org_id = NULL and would be
-- invisible to everyone once RLS is on. This assigns them to one default org.
-- Safe to run on an empty database (it simply does nothing).

do $do$
declare
  default_org uuid;
begin
  if not exists (select 1 from public.leads              where org_id is null)
 and not exists (select 1 from public.email_log          where org_id is null)
 and not exists (select 1 from public.call_log           where org_id is null)
 and not exists (select 1 from public.email_templates    where org_id is null)
 and not exists (select 1 from public.integration_tokens where org_id is null)
  then
    raise notice 'Backfill: nothing to do.';
    return;
  end if;

  select id into default_org from public.organizations where slug = 'default';
  if default_org is null then
    insert into public.organizations (name, slug)
    values ('Default workspace', 'default')
    returning id into default_org;
    raise notice 'Backfill: created default org %', default_org;
  end if;

  update public.leads              set org_id = default_org where org_id is null;
  update public.email_log          set org_id = default_org where org_id is null;
  update public.call_log           set org_id = default_org where org_id is null;
  update public.email_templates    set org_id = default_org where org_id is null;
  update public.integration_tokens set org_id = default_org where org_id is null;

  raise notice 'Backfill: existing rows assigned to org %', default_org;
end $do$;

-- >>> ACTION REQUIRED after your first signup <<<
-- The default org has no members, so nobody can see the backfilled rows yet.
-- Sign up, then claim it by running (replace the email):
--
--   insert into public.memberships (org_id, user_id, role)
--   select o.id, u.id, 'owner'
--   from public.organizations o, auth.users u
--   where o.slug = 'default' and u.email = 'you@example.com'
--   on conflict (org_id, user_id) do nothing;
--
-- Signing up also gave you a personal org; you can keep both, or move your
-- data over and delete the unused one.


-- ── 7. Enforce NOT NULL and composite keys ──────────────────────────────────
-- LAST: every check here depends on part 6 having filled org_id.
-- Guarded so the migration doesn't fail if a table still has orphans — fix the
-- data and re-run rather than ending up half-applied.

do $do$
declare
  t         text;
  remaining int;
begin
  foreach t in array array['leads','email_log','call_log','email_templates'] loop
    execute format('select count(*) from public.%I where org_id is null', t) into remaining;
    if remaining = 0 then
      execute format('alter table public.%I alter column org_id set not null', t);
    else
      raise warning '%: still has % row(s) with org_id IS NULL — NOT NULL not applied.', t, remaining;
    end if;
  end loop;
end $do$;

-- Composite primary key, addable only once org_id is NOT NULL.
do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_templates'::regclass and contype = 'p'
  ) and not exists (select 1 from public.email_templates where org_id is null)
  then
    alter table public.email_templates
      add constraint email_templates_pkey primary key (org_id, step);
  end if;
end $do$;

-- One connection per (org, platform). Skipped with a warning if pre-existing
-- rows would violate it — e.g. two users had connected the same platform
-- before the backfill merged them into one org.
do $do$
declare
  dupes int;
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'integration_tokens_org_platform_key'
      and conrelid = 'public.integration_tokens'::regclass
  ) then
    return;
  end if;

  select count(*) into dupes from (
    select org_id, platform from public.integration_tokens
    where org_id is not null
    group by org_id, platform having count(*) > 1
  ) d;

  if dupes = 0 then
    alter table public.integration_tokens
      add constraint integration_tokens_org_platform_key unique (org_id, platform);
  else
    raise warning
      'integration_tokens: % duplicate (org_id, platform) pair(s) — unique constraint NOT applied. '
      'De-duplicate, then re-run this file.', dupes;
  end if;
end $do$;

reset check_function_bodies;
