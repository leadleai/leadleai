-- Tags, notes, and custom fields for leads.
--
-- Three independent features, one migration, all sharing the same tenancy rule
-- as leads/call_log/email_log/knowledge_base (0008/0009): a row is visible and
-- writable only to members of its own org — org_id in (select public.user_org_ids())
-- — enforced by RLS, not by application code alone. The dashboard talks to these
-- tables in USER mode (the caller's JWT), so RLS is the real boundary.
--
--   TAGS          lead_tags            an org's reusable tag library
--                 lead_tag_assignments many-to-many: which tags a lead carries
--   NOTES         lead_notes           free-text notes on a lead, with author
--   CUSTOM FIELDS custom_field_defs     per-org field definitions (the schema)
--                 lead_custom_values    a lead's value for one defined field
--
-- Every child table carries its own org_id (denormalised from the parent lead /
-- tag / definition). It's redundant, but it lets every table use the exact same
-- one-line org_isolation policy the rest of the schema uses, and keeps PostgREST
-- filtering fast and uniform. The FKs cascade on delete, so removing a lead, tag,
-- or field definition cleans up its dependent rows automatically.

create extension if not exists pgcrypto;

-- ── TAGS ─────────────────────────────────────────────────────────────────────
-- The org's tag library. Names are unique per org, case-insensitively, so you
-- can't end up with both "VIP" and "vip". color is a CSS hex like '#6b7280'.
create table if not exists public.lead_tags (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 60),
  color      text not null default '#6b7280'
             check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create unique index if not exists lead_tags_org_name_uniq
  on public.lead_tags (org_id, lower(name));
create index if not exists lead_tags_org_idx
  on public.lead_tags (org_id, created_at desc);

-- Many-to-many join: which tags are on which lead. Composite PK makes assigning
-- the same tag twice a no-op-safe upsert target (on_conflict do nothing).
create table if not exists public.lead_tag_assignments (
  lead_id    uuid not null references public.leads(id)      on delete cascade,
  tag_id     uuid not null references public.lead_tags(id)  on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

create index if not exists lead_tag_assignments_tag_idx
  on public.lead_tag_assignments (tag_id);
create index if not exists lead_tag_assignments_org_idx
  on public.lead_tag_assignments (org_id);

-- ── NOTES ────────────────────────────────────────────────────────────────────
-- Free-text notes on a lead. author_user_id is who wrote it (null if it ever
-- comes from a background job); it references auth.users so a deleted user leaves
-- their notes intact but authorless.
create table if not exists public.lead_notes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  lead_id        uuid not null references public.leads(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body           text not null check (char_length(trim(body)) between 1 and 10000),
  created_at     timestamptz not null default now()
);

create index if not exists lead_notes_lead_idx
  on public.lead_notes (lead_id, created_at desc);
create index if not exists lead_notes_org_idx
  on public.lead_notes (org_id);

-- ── CUSTOM FIELDS ────────────────────────────────────────────────────────────
-- Per-org field definitions — each org designs its own extra lead attributes.
-- field_key is a stable slug (lower_snake), unique per org; label is the display
-- name. options is used only when field_type = 'select' (an array of strings).
create table if not exists public.custom_field_defs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  field_key  text not null check (field_key ~ '^[a-z][a-z0-9_]{0,49}$'),
  label      text not null check (char_length(trim(label)) between 1 and 100),
  field_type text not null default 'text'
             check (field_type in ('text','number','date','select')),
  options    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists custom_field_defs_org_key_uniq
  on public.custom_field_defs (org_id, field_key);
create index if not exists custom_field_defs_org_idx
  on public.custom_field_defs (org_id, created_at asc);

-- A lead's value for one defined field. Stored as text regardless of field_type
-- (number/date are serialised by the client and re-parsed for display); this
-- keeps the table simple and the definition the single source of truth for shape.
-- One value per (lead, field) — the composite PK makes writes an upsert target.
create table if not exists public.lead_custom_values (
  lead_id       uuid not null references public.leads(id) on delete cascade,
  field_def_id  uuid not null references public.custom_field_defs(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  value         text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (lead_id, field_def_id)
);

create index if not exists lead_custom_values_lead_idx
  on public.lead_custom_values (lead_id);
create index if not exists lead_custom_values_org_idx
  on public.lead_custom_values (org_id);

-- Keep updated_at fresh on every value write (function defined in 0009).
drop trigger if exists lead_custom_values_touch_updated_at on public.lead_custom_values;
create trigger lead_custom_values_touch_updated_at
  before update on public.lead_custom_values
  for each row execute function public.touch_updated_at();

-- ── Table-level privileges ───────────────────────────────────────────────────
-- RLS decides which rows; GRANT decides table access. anon is deliberately
-- excluded everywhere — the browser reaches these only through FastAPI in USER
-- mode (authenticated) or via the service role for background work.
do $do$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach t in array array[
      'lead_tags','lead_tag_assignments','lead_notes',
      'custom_field_defs','lead_custom_values'
    ] loop
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach t in array array[
      'lead_tags','lead_tag_assignments','lead_notes',
      'custom_field_defs','lead_custom_values'
    ] loop
      execute format('grant all on public.%I to service_role', t);
    end loop;
  end if;
end $do$;

-- ── Row-level security: strict per-org isolation on every table ──────────────
-- One permissive policy each: you may touch a row only when its org is one of
-- yours. Identical shape to the leads/knowledge_base policies.
do $do$
declare
  t text;
begin
  foreach t in array array[
    'lead_tags','lead_tag_assignments','lead_notes',
    'custom_field_defs','lead_custom_values'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "org_isolation" on public.%I', t);
    execute format(
      'create policy "org_isolation" on public.%I for all to authenticated '
      'using (org_id in (select public.user_org_ids())) '
      'with check (org_id in (select public.user_org_ids()))', t);
  end loop;
end $do$;
