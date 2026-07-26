# OAuth2 Integrations on Supabase

Secure, serverless OAuth2 for connecting external platforms (Google, LinkedIn,
Facebook Leads, HubSpot, Salesforce, Zoho, Microsoft, Pipedrive, Slack, Sangam
CRM) and syncing leads. **Client secrets never touch the browser** — the token
exchange happens inside an Edge Function; tokens are stored AES-GCM encrypted and
protected by Row-Level Security.

## Architecture

```
Browser (React)                 Supabase
──────────────                  ────────────────────────────────────────
Connect button
  │  supabase.functions.invoke('oauth-authorize', {platform})   (JWT attached)
  ▼
oauth-authorize  ──────────────▶ builds provider consent URL + signed `state`
  │  returns { authorization_url }
  ▼
window.location = authorization_url
  │  user grants access on the provider
  ▼
provider ─▶ oauth-callback?code&state   (no JWT; verify_jwt = false)
                                 verify state → exchange code (secret here)
                                 → AES-encrypt tokens → upsert (service role)
                                 → 302 back to /app/integrations?connected=…
Browser reads connection status via supabase.from('integration_tokens')  (RLS)
```

## One-time setup

1. **Create a project** at https://supabase.com and note the Project URL and the
   `anon` and `service_role` keys (Settings → API).

2. **Enable Anonymous sign-ins**: Authentication → Providers → Anonymous → on.
   (Gives each visitor a real `auth.uid()` for RLS. Swap for real auth later.)

3. **Apply the schema**: SQL Editor → paste `migrations/0001_integration_tokens.sql`
   → Run. (Or `supabase db push` with the CLI.)

4. **Generate secrets**

   ```bash
   # signs the CSRF state
   openssl rand -base64 48
   # encrypts tokens at rest (must be 32 bytes)
   openssl rand -base64 32
   ```

5. **Set Edge Function secrets** (CLI) — nothing here is ever exposed to the browser:

   ```bash
   supabase secrets set \
     STATE_SECRET='<from step 4>' \
     TOKEN_ENC_KEY='<32-byte base64 from step 4>' \
     FRONTEND_URL='http://localhost:3000' \
     PUBLIC_FUNCTIONS_URL='https://<project-ref>.supabase.co/functions/v1' \
     GOOGLE_CLIENT_ID='...'   GOOGLE_CLIENT_SECRET='...' \
     LINKEDIN_CLIENT_ID='...' LINKEDIN_CLIENT_SECRET='...' \
     FACEBOOK_CLIENT_ID='...' FACEBOOK_CLIENT_SECRET='...'
   # (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically)
   # Custom provider example:
   #   SANGAM_CLIENT_ID=... SANGAM_CLIENT_SECRET=... \
   #   SANGAM_AUTHORIZE_URL=https://app.sangamcrm.com/oauth/authorize \
   #   SANGAM_TOKEN_URL=https://app.sangamcrm.com/oauth/token
   ```

6. **Register the redirect URI** in each provider's developer console — the same
   for every provider:

   ```
   https://<project-ref>.supabase.co/functions/v1/oauth-callback
   ```

7. **Deploy the functions**

   ```bash
   supabase functions deploy oauth-authorize
   supabase functions deploy oauth-callback --no-verify-jwt
   ```

8. **Point the frontend at Supabase** — set in `frontend/.env`:

   ```
   REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=<anon key>
   ```

   Restart the dev server. The Integrations "Connect" buttons now run the real
   OAuth2 flow. Without these vars, the app falls back to the built-in demo.

## Adding lead-sync (next step)

After connection, tokens live in `integration_tokens` (encrypted). Add an
`sync-leads` Edge Function that: reads + decrypts the token, calls the provider's
lead API (e.g. Facebook `/{page}/leadgen_forms`, LinkedIn Lead Gen Forms, HubSpot
`/crm/v3/objects/contacts`), refreshes via `refresh_token` when expired, and
upserts into a `leads` table. This is the one provider-specific piece — share the
API docs for your priority provider and I'll wire it.
