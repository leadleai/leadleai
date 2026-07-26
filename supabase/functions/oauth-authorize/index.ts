// GET/POST /functions/v1/oauth-authorize   body/query: { platform }
// Requires the caller's Supabase session (JWT). Returns the provider consent URL
// with a signed CSRF `state` bound to the current user. The browser then
// redirects to that URL. Client secrets stay here — never sent to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, handleOptions, json } from "../_shared/cors.ts";
import { clientCreds, getProvider, isConfigured } from "../_shared/providers.ts";
import { signState } from "../_shared/state.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const url = new URL(req.url);
    let platform = url.searchParams.get("platform") ?? "";
    if (!platform && req.method === "POST") {
      platform = (await req.json().catch(() => ({})))?.platform ?? "";
    }
    if (!platform) return json({ error: "missing platform" }, 400);
    if (!isConfigured(platform)) {
      return json({
        error: `${platform} is not configured on the server`,
        hint: `Set ${platform.toUpperCase()}_CLIENT_ID / ${platform.toUpperCase()}_CLIENT_SECRET as Edge Function secrets.`,
      }, 400);
    }

    const provider = getProvider(platform);
    const [clientId] = clientCreds(platform);
    const state = await signState(
      { uid: userData.user.id, platform },
      Deno.env.get("STATE_SECRET")!,
    );
    const redirectUri = `${Deno.env.get("PUBLIC_FUNCTIONS_URL")}/oauth-callback`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId!,
      redirect_uri: redirectUri,
      scope: provider.scopes,
      state,
      ...provider.extras,
    });
    return json({ authorization_url: `${provider.authorizeUrl}?${params.toString()}` });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
