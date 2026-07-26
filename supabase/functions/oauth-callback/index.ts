// GET /functions/v1/oauth-callback?code=…&state=…
// The provider redirects the user's browser here after they grant access.
// Deploy with `--no-verify-jwt` (there is no session on this request — identity
// comes from the signed `state`). Verifies state -> exchanges code for tokens
// server-to-server -> stores them encrypted (service role) -> redirects to the app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { redirect } from "../_shared/cors.ts";
import { clientCreds, getProvider } from "../_shared/providers.ts";
import { verifyState } from "../_shared/state.ts";
import { encrypt } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const frontend = Deno.env.get("FRONTEND_URL")!;
  const back = (params: Record<string, string>) =>
    redirect(`${frontend}/app/integrations?${new URLSearchParams(params)}`);

  const providerError = url.searchParams.get("error");
  if (providerError) return back({ error: providerError });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back({ error: "missing_code_or_state" });

  let payload;
  try {
    payload = await verifyState(state, Deno.env.get("STATE_SECRET")!);
  } catch (_e) {
    return back({ error: "invalid_state" });
  }
  const { uid, platform } = payload;

  const provider = getProvider(platform);
  const [clientId, clientSecret] = clientCreds(platform);
  const redirectUri = `${Deno.env.get("PUBLIC_FUNCTIONS_URL")}/oauth-callback`;

  // Server-to-server token exchange (the Client Secret lives only here).
  let tokenResp: Response;
  try {
    tokenResp = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId!,
        client_secret: clientSecret!,
      }),
    });
  } catch (_e) {
    return back({ error: "token_exchange_failed", platform });
  }
  if (!tokenResp.ok) return back({ error: "token_exchange_failed", platform });

  const raw = await tokenResp.text();
  let tok: Record<string, unknown>;
  try {
    tok = JSON.parse(raw);
  } catch {
    tok = Object.fromEntries(new URLSearchParams(raw));
  }
  const accessToken = tok["access_token"] as string | undefined;
  if (!accessToken) return back({ error: "no_access_token", platform });

  const encKey = Deno.env.get("TOKEN_ENC_KEY")!;
  const expiresIn = tok["expires_in"] ? Number(tok["expires_in"]) : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role: bypasses RLS
  );
  const { error: dbErr } = await admin.from("integration_tokens").upsert({
    user_id: uid,
    platform,
    access_token: await encrypt(accessToken, encKey),
    refresh_token: await encrypt((tok["refresh_token"] as string) ?? null, encKey),
    token_type: (tok["token_type"] as string) ?? "Bearer",
    scope: (tok["scope"] as string) ?? provider.scopes,
    expires_at: expiresAt,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,platform" });

  if (dbErr) return back({ error: "storage_failed", platform });
  return back({ connected: platform });
});
