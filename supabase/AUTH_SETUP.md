# Auth + multi-tenancy setup

Everything you need to configure by hand, in the order to do it. Nothing below
happens automatically — the code is in place, but it stays inert until these
are done.

---

## 1. Run the migration

Apply `supabase/migrations/0008_orgs_memberships_rls.sql` (SQL Editor, or
`supabase db push`).

It creates `organizations`, `memberships`, `invites`; adds `org_id` to
`leads`, `email_log`, `call_log`, `email_templates`, `integration_tokens`;
enables RLS with org-isolation policies on all of them; and installs the
signup trigger that gives every new user a workspace.

`integration_tokens` (from migration `0001`) was never applied to this project,
so `0008` now creates it if it's missing — you do **not** need to run `0001`
separately. The other prerequisites (`0002`, `0006`, `0007`) must already be in
place; if any is missing the migration stops immediately and names it.

**On a database with existing rows** it also creates an org with slug
`default` and assigns your current data to it. That org starts with *no
members*, so nothing is visible until you claim it — see step 5.

> Watch the output for `WARNING: ... NOT NULL not applied`. That means some
> rows still had `org_id IS NULL`; fix the data and re-run (the file is
> idempotent).

---

## 2. Project Settings → API

Copy three values:

| Value | Goes to | Notes |
|---|---|---|
| Project URL | `backend/.env` → `SUPABASE_URL`, `frontend/.env` → `REACT_APP_SUPABASE_URL` | |
| `anon` `public` key | `backend/.env` → `SUPABASE_ANON_KEY`, `frontend/.env` → `REACT_APP_SUPABASE_ANON_KEY` | Public by design. The backend needs it to forward user tokens so RLS applies. |
| `service_role` key | `backend/.env` → `SUPABASE_SERVICE_ROLE_KEY` | **Backend only.** Bypasses RLS. Never put it in `frontend/.env` — anything with `REACT_APP_` is compiled into the browser bundle. |

**Token signing** — the backend adapts to whichever mode your project uses, so
there is usually nothing to configure:

| Your project | How tokens are verified | Config needed |
|---|---|---|
| **JWT signing keys** (current default) — ES256/RS256 | Public keys fetched from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, cached 10 min | **None** — the URL is derived from `SUPABASE_URL` |
| **Legacy JWT Secret** — HS256 | The shared secret | `SUPABASE_JWT_SECRET` (Project Settings → API → JWT Settings) |

This project issues **ES256** tokens, so `SUPABASE_JWT_SECRET` is not used —
it can stay blank. Both modes are supported at once, so rotating from one to
the other needs no code change.

Optional overrides: `SUPABASE_JWKS_URL` (self-hosted / custom auth domain) and
`SUPABASE_JWKS_CACHE_SECONDS` (default `600`).

> If you see `401` with *"The specified alg value is not allowed"* in the logs,
> the backend is pinned to the wrong algorithm — that's the bug this table
> describes, fixed by reading the algorithm from each token's header.

Also add:

```
backend/.env → DEFAULT_ORG_SLUG=default
```

That's the org the slug-less `/enquiry` URL files leads under.

> ⚠️ Your `frontend/.env` currently has `REACT_APP_SUPABASE_URL=` and
> `REACT_APP_SUPABASE_ANON_KEY=` **empty**. Until you fill them, the login page
> shows an "Auth isn't configured" banner and every button is disabled.
> Restart the dev server after editing — CRA only reads `.env` at startup.

---

## 3. Authentication → Providers

**Email** — on by default. Decide one thing:

- *Confirm email* **ON** (recommended): signup sends a confirmation link, and
  the account only becomes usable after clicking it. The UI handles this — it
  shows a "check your email" screen.
- *Confirm email* **OFF**: signup logs you straight in. Faster for testing.

**Google:**

1. Create an OAuth client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → *Create Credentials* → *OAuth client ID* → *Web application*.
2. Under **Authorized redirect URIs** add exactly:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
   (Google's redirect goes to *Supabase*, not to your app.)
3. Copy the Client ID + Client Secret into Supabase → *Authentication* →
   *Providers* → *Google* → enable, paste, save.

---

## 4. Authentication → URL Configuration

| Field | Value (development) |
|---|---|
| **Site URL** | `http://localhost:3000` |
| **Redirect URLs** | `http://localhost:3000/app`<br>`http://localhost:3000/login`<br>`http://localhost:3000/reset-password` |

All three redirect entries matter:

- `/app` — where Google sign-in lands.
- `/login` — where the email-confirmation link lands.
- `/reset-password` — where the password-reset link lands. **Miss this one and
  password reset silently fails**: the link bounces to the site root and the
  reset page reports an invalid link.

Add your production equivalents (`https://yourdomain.com/...`) before deploying.

---

## 5. Claim the backfilled data

Sign up once through the app. That gives you a personal workspace — but your
*existing* leads are in the `default` org from step 1. Attach yourself to it:

```sql
insert into public.memberships (org_id, user_id, role)
select o.id, u.id, 'owner'
from public.organizations o, auth.users u
where o.slug = 'default' and u.email = 'you@example.com'
on conflict (org_id, user_id) do nothing;
```

You'll then be in two workspaces, switchable from the avatar menu. Keep both,
or move the data and delete the spare.

---

## 6. Email templates (optional)

*Authentication → Email Templates*. The defaults work. If you customise
**Reset Password**, keep `{{ .ConfirmationURL }}` intact — that's the link the
`/reset-password` page consumes.

---

## Verifying it worked

1. Visit `/app` while signed out → you land on `/login`.
2. Sign up → you're in, and the header shows your email + workspace name.
3. `curl http://localhost:8001/api/leads` with no token → `401`.
4. Team page shows you as **owner** and your enquiry URL as
   `/enquiry/<your-slug>`.
5. Submit that enquiry form while signed out → the lead appears in *your*
   workspace only.

### The isolation test worth doing

Sign up as a second user in a private window, then have each org create a lead.
Neither should ever see the other's. To prove it's the *database* enforcing
this and not the API, run this in the SQL editor as the `authenticated` role —
it returns only your own org's rows even though it asks for everything:

```sql
select id, org_id, name from public.leads;
```

---

## Security invariants

- The browser only ever holds the **anon** key. The service-role key lives in
  `backend/.env`.
- `org_id` is never taken from the client for reads. `X-Org-Id` only *chooses*
  among orgs you already belong to; naming someone else's org returns **403**.
- Request-path queries run as **you** (your JWT forwarded to PostgREST), so RLS
  is the enforcement. Service-role access is limited to work with no
  authenticated caller: background auto-call, the drip sweep, the public
  enquiry insert, the unsubscribe link, and the OAuth callback.
- Enquiry slugs are public identifiers, not secrets — a slug lets someone
  *submit* to an org, never *read* from it.
