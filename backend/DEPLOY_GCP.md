# Deploying the backend to Google Cloud Run

The FastAPI backend is containerized and stateless, so it can run on **Cloud Run
with scale-to-zero**. The follow-up drip and the auto-caller used to run as
in-process background loops — those don't survive scale-to-zero, so they've been
replaced by two secured HTTP endpoints that **Cloud Scheduler** pings on a
schedule:

| Endpoint | What it does | Suggested frequency |
|---|---|---|
| `POST /api/cron/auto-call-sweep` | Calls every lead that's been `new` and un-called for longer than `AUTO_CALL_DELAY_SECONDS` | every **1 min** |
| `POST /api/cron/followup-sweep` | Sends any due follow-up emails (the 1/3/7 drip) | every **5–15 min** |

Both require the header `X-Cron-Secret: <CRON_SECRET>` and return `401` otherwise.
All existing guardrails are unchanged (master switches, quiet hours, dedupe, the
atomic once-per-step / call-once claims, the 3-email cap, unsubscribe).

> Everything below runs from the `backend/` directory. Replace `PROJECT_ID` and
> `REGION` (e.g. `us-central1`) with your own.

---

## 0. One-time setup

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com
```

---

## 1. Build & push the container

Easiest is to let Cloud Build build from the Dockerfile and push to Artifact
Registry. Create a repo once:

```bash
gcloud artifacts repositories create app \
    --repository-format=docker --location=REGION
```

Then build & push (run from `backend/`):

```bash
gcloud builds submit \
    --tag REGION-docker.pkg.dev/PROJECT_ID/app/salescale-backend:latest .
```

(Local alternative: `docker build -t ...` then `docker push ...`. The image
listens on `$PORT`, which Cloud Run sets to 8080.)

---

## 2. Deploy to Cloud Run

```bash
gcloud run deploy salescale-backend \
    --image REGION-docker.pkg.dev/PROJECT_ID/app/salescale-backend:latest \
    --region REGION \
    --platform managed \
    --allow-unauthenticated \
    --min-instances 0 \
    --port 8080
```

`--allow-unauthenticated` makes the API reachable by your frontend and by Cloud
Scheduler over HTTPS. The cron endpoints are still protected by `CRON_SECRET`
(below); the rest of the API is protected by Supabase auth + RLS as before. After
this, note the service URL, e.g. `https://salescale-backend-xxxx.a.run.app`.

---

## 3. Environment variables & secrets

Put **non-secret config** in plain env vars and **secrets** in Secret Manager —
never in a committed file (`.env` is git-/docker-ignored).

### 3a. Create secrets

```bash
create_secret() { printf '%s' "$2" | gcloud secrets create "$1" --data-file=- 2>/dev/null \
  || printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=-; }

create_secret SUPABASE_SERVICE_ROLE_KEY  "eyJ...service-role..."
create_secret SUPABASE_ANON_KEY          "eyJ...anon..."
create_secret SUPABASE_JWT_SECRET        ""          # only for legacy HS256 projects
create_secret BLAND_API_KEY              "org_..."
create_secret RESEND_API_KEY             "re_..."
create_secret ANTHROPIC_API_KEY          ""          # only if AI_EMAILS_ENABLED=true
create_secret TOKEN_ENCRYPTION_KEY       "<fernet key>"   # if using OAuth integrations
create_secret SESSION_SECRET             "<random>"       # if using OAuth integrations
create_secret CRON_SECRET                "$(openssl rand -hex 32)"
```

> Save the `CRON_SECRET` value — you'll pass the same one to the Scheduler jobs
> in step 4. `TOKEN_ENCRYPTION_KEY` is a Fernet key:
> `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.

### 3b. Set env + wire secrets on the service

```bash
gcloud run services update salescale-backend --region REGION \
  --set-env-vars "\
SUPABASE_URL=https://YOUR-PROJECT.supabase.co,\
ALLOWED_ORIGINS=https://your-app.vercel.app,\
PUBLIC_BASE_URL=https://salescale-backend-xxxx.a.run.app,\
DEFAULT_ORG_SLUG=default,\
AUTO_CALL_ENABLED=true,\
AUTO_CALL_DELAY_SECONDS=45,\
AUTO_CALL_DEDUPE_MINUTES=60,\
AUTO_CALL_QUIET_START=09:00,\
AUTO_CALL_QUIET_END=20:00,\
AUTO_CALL_TIMEZONE=Asia/Kolkata,\
FOLLOWUP_ENABLED=true,\
FOLLOWUP_FROM_EMAIL=SaleScale AI <hello@your-verified-domain.com>,\
KB_MATCHING_ENABLED=true,\
AI_EMAILS_ENABLED=false,\
ANTHROPIC_MODEL=claude-sonnet-5" \
  --set-secrets "\
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,\
SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,\
BLAND_API_KEY=BLAND_API_KEY:latest,\
RESEND_API_KEY=RESEND_API_KEY:latest,\
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,\
TOKEN_ENCRYPTION_KEY=TOKEN_ENCRYPTION_KEY:latest,\
SESSION_SECRET=SESSION_SECRET:latest,\
CRON_SECRET=CRON_SECRET:latest"
```

### 3c. Full env-var reference

**Required**

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (used for REST + JWKS auth). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key for background/service-mode writes. **Secret.** |
| `SUPABASE_ANON_KEY` | Forwarded with user JWTs so RLS applies. **Secret.** |
| `CRON_SECRET` | Shared secret the Scheduler sends as `X-Cron-Secret`. **Secret.** Missing ⇒ cron endpoints return 503. |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (your Vercel URL). See §6. |
| `PUBLIC_BASE_URL` | This service's public URL — builds the email unsubscribe link and OAuth redirect URIs. |

**Feature config (have sensible defaults)**

| Var | Default | Purpose |
|---|---|---|
| `DEFAULT_ORG_SLUG` | `default` | Org for `/enquiry` submissions with no slug. |
| `AUTO_CALL_ENABLED` | `false` | Master switch for auto-calling. |
| `AUTO_CALL_DELAY_SECONDS` | `45` | A lead must be this old before the sweep calls it. |
| `AUTO_CALL_DEDUPE_MINUTES` | `60` | Don't re-call the same phone within this window. |
| `AUTO_CALL_QUIET_START` / `AUTO_CALL_QUIET_END` | `09:00` / `20:00` | Allowed calling window (also gates follow-up sends). |
| `AUTO_CALL_TIMEZONE` | `Asia/Kolkata` | Timezone for the quiet-hours window. |
| `FOLLOWUP_ENABLED` | `false` | Master switch for follow-up emails. |
| `FOLLOWUP_FROM_EMAIL` | — | Verified Resend sender. Required to send email. |
| `KB_MATCHING_ENABLED` | `true` | Rule-based KB → email matching. |
| `AI_EMAILS_ENABLED` | `false` | AI-written follow-ups (takes precedence when on). |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Model for AI emails. |
| `FOLLOWUP_INTERVAL_MINUTES` | `1` | Display-only now (Scheduler sets the real cadence). |

**Secrets — set only if you use that feature**

| Var | Needed for |
|---|---|
| `BLAND_API_KEY` | Placing calls (Bland). **Secret.** |
| `RESEND_API_KEY` | Sending email (Resend). **Secret.** |
| `ANTHROPIC_API_KEY` | AI emails, when `AI_EMAILS_ENABLED=true`. **Secret.** |
| `SUPABASE_JWT_SECRET` | Only legacy HS256 Supabase projects (asymmetric projects use JWKS — no secret). **Secret.** |
| `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET` | OAuth integrations (token encryption + signed state). **Secret.** |
| `{PROVIDER}_CLIENT_ID` / `{PROVIDER}_CLIENT_SECRET` (+ optional `_SCOPES`, `_AUTHORIZE_URL`, `_TOKEN_URL`) | Each OAuth provider you enable (e.g. `GOOGLE_CLIENT_ID`). **Secret.** |
| `SANGAM_API_URL`, `SANGAM_TOKEN`, `CRM_PROVIDER` | Sangam CRM import. |

**Optional / advanced:** `SUPABASE_JWKS_URL`, `SUPABASE_JWKS_CACHE_SECONDS`,
`MONGO_URL` + `DB_NAME` (Mongo is off unless `MONGO_URL` is set — the app's data
lives in Supabase), `CORS_ORIGINS` (legacy alias for `ALLOWED_ORIGINS`).

---

## 4. Create the two Cloud Scheduler jobs

Both POST to the service with the `X-Cron-Secret` header. Use the **same**
`CRON_SECRET` value you stored in step 3a.

```bash
SERVICE_URL="https://salescale-backend-xxxx.a.run.app"
SECRET="<the CRON_SECRET value>"

# Auto-call sweep — every minute
gcloud scheduler jobs create http auto-call-sweep \
    --location REGION \
    --schedule "* * * * *" \
    --uri "$SERVICE_URL/api/cron/auto-call-sweep" \
    --http-method POST \
    --headers "X-Cron-Secret=$SECRET" \
    --attempt-deadline 60s

# Follow-up sweep — every 10 minutes
gcloud scheduler jobs create http followup-sweep \
    --location REGION \
    --schedule "*/10 * * * *" \
    --uri "$SERVICE_URL/api/cron/followup-sweep" \
    --http-method POST \
    --headers "X-Cron-Secret=$SECRET" \
    --attempt-deadline 120s
```

Test either job immediately and watch logs:

```bash
gcloud scheduler jobs run auto-call-sweep --location REGION
gcloud run services logs read salescale-backend --region REGION --limit 50
```

A correct call logs `cron: auto-call-sweep triggered` and returns a JSON summary
(`eligible` / `called` / `skipped`). A wrong/missing secret logs
`cron call rejected` and returns 401.

> **Harden further (optional):** instead of `--allow-unauthenticated`, deploy the
> service private and give the Scheduler jobs a service account with the
> `roles/run.invoker` role via `--oidc-service-account-email`. The `X-Cron-Secret`
> check still applies on top.

---

## 5. How the delay works now (no persistent process)

The public enquiry form still `POST`s to `/api/leads`, which just inserts the
lead as `new`. It no longer schedules an in-process background call. The
**auto-call sweep** (running every minute) later finds leads where
`status = new`, `auto_called_at is null`, and `created_at` is older than
`AUTO_CALL_DELAY_SECONDS`, and places the call — atomically claiming each lead
first so overlapping sweeps can't double-dial. Net effect: the same ~45s delay,
but durable across scale-to-zero.

---

## 6. Point the frontend (Vercel) at Cloud Run

1. In Vercel, set the frontend env var to the Cloud Run URL and redeploy:

   ```
   REACT_APP_BACKEND_URL=https://salescale-backend-xxxx.a.run.app
   ```

2. On Cloud Run, set `ALLOWED_ORIGINS` to your Vercel origin(s), comma-separated,
   **no trailing slash**:

   ```bash
   gcloud run services update salescale-backend --region REGION \
     --set-env-vars ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
   ```

   With explicit origins the API sends `Access-Control-Allow-Credentials: true`.
   Leaving it as `*` (the default) disables credentialed CORS — fine for this app
   since auth is a bearer token, but set your real origins in production.

3. Also set `PUBLIC_BASE_URL` to the Cloud Run URL so unsubscribe links and OAuth
   redirect URIs resolve to the deployed backend.

---

## 7. Smoke test

```bash
curl https://salescale-backend-xxxx.a.run.app/api/           # {"message":"Hello World"}
curl -X POST https://salescale-backend-xxxx.a.run.app/api/cron/auto-call-sweep   # 401 (no secret)
curl -X POST -H "X-Cron-Secret: <CRON_SECRET>" \
     https://salescale-backend-xxxx.a.run.app/api/cron/auto-call-sweep           # 200 + summary
```
