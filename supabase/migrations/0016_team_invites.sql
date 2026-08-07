-- ============================================================================
-- Team management: shareable, expiring invites + a DATABASE guarantee that an
-- organization can never be left without an owner.
--
-- Builds on migration 0008 (organizations / memberships / invites + RLS).
-- Run once (Supabase SQL editor or `supabase db push`). Idempotent: re-running
-- is safe.
--
--   1. invites: add token, status, expires_at (reuses the existing table)
--   2. signup trigger: honour status + expiry when auto-joining invitees
--   3. memberships: trigger that blocks removing/demoting the LAST owner
-- ============================================================================

create extension if not exists pgcrypto;


-- ── 1. Give invites a token, a status, and an expiry ────────────────────────
-- The table already exists (0008) as (id, org_id, email, role, invited_by,
-- accepted_at, created_at, unique(org_id, email)). We ADD to it rather than
-- recreate, so existing pending invites survive.

alter table public.invites
  add column if not exists token      text,
  add column if not exists status     text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

-- Backfill a token for any row created before this migration, then make the
-- column self-generating, mandatory, and unique. A 24-byte random hex string is
-- an unguessable bearer secret suitable for an invite link.
update public.invites set token = encode(gen_random_bytes(24), 'hex') where token is null;

alter table public.invites alter column token set default encode(gen_random_bytes(24), 'hex');
alter table public.invites alter column token set not null;

create unique index if not exists invites_token_key on public.invites (token);

-- Older rows tracked acceptance only via accepted_at; reconcile status with it.
update public.invites set status = 'accepted'
  where accepted_at is not null and status <> 'accepted';


-- ── 2. Signup trigger: respect status + expiry ──────────────────────────────
-- Same behaviour as 0008 (invited email -> join that org; otherwise a personal
-- org), but it now ignores accepted/revoked/expired invites and records the
-- acceptance in `status` as well as `accepted_at`.
set check_function_bodies = off;

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
  where lower(email) = lower(new.email)
    and status = 'pending'
    and expires_at > now()
  order by created_at
  limit 1;

  if found then
    insert into public.memberships (org_id, user_id, role)
    values (invite.org_id, new.id, invite.role)
    on conflict (org_id, user_id) do nothing;

    update public.invites
      set status = 'accepted', accepted_at = now()
      where id = invite.id;
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


-- ── 3. An org must always keep at least one owner ───────────────────────────
-- The backend also checks this for a friendly error, but enforcing it in the
-- database makes it impossible to bypass — even a direct SQL write or a bug in
-- an RLS-authorised call cannot orphan an org.
--
-- Fires only when an OWNER row is being deleted or demoted. If that would leave
-- the org with zero owners, it raises. A cascade delete of the whole
-- organization is exempted: by the time the cascade removes membership rows the
-- organizations row is already gone, so the guard below sees it missing and
-- steps aside.

create or replace function public.prevent_last_owner_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  remaining_owners int;
begin
  -- Whole-org deletion (cascade): the org row is already gone -> don't block it.
  if not exists (select 1 from public.organizations where id = old.org_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Only an owner LOSING owner status is dangerous.
  if tg_op = 'DELETE' then
    if old.role <> 'owner' then
      return old;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.role <> 'owner' or new.role = 'owner' then
      return new;
    end if;
  end if;

  select count(*) into remaining_owners
  from public.memberships
  where org_id = old.org_id and role = 'owner' and user_id <> old.user_id;

  if remaining_owners = 0 then
    raise exception 'An organization must always have at least one owner.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $fn$;

drop trigger if exists memberships_keep_owner on public.memberships;
create trigger memberships_keep_owner
  before update or delete on public.memberships
  for each row execute function public.prevent_last_owner_loss();

reset check_function_bodies;
