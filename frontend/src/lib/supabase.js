import { createClient } from "@supabase/supabase-js";

// The browser gets the ANON key ONLY. The service-role key is backend-only and
// must never appear in this bundle — it bypasses RLS.
const url = process.env.REACT_APP_SUPABASE_URL;
const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Null when unconfigured, so the UI can show a clear "auth isn't set up" state
// instead of crashing on every call.
export const supabase =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Needed so the ?code=... from Google / the reset-password link is
          // picked up and exchanged for a session on page load.
          detectSessionInUrl: true,
        },
      })
    : null;

export const supabaseConfigured = () => Boolean(supabase);

/** Current access token, or null. Sent to FastAPI as `Authorization: Bearer`. */
export async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

// NOTE: this module used to export ensureSession(), which silently signed
// everyone in ANONYMOUSLY so RLS had some user id to work with. That is
// incompatible with real tenancy — every visitor became their own "user" — so
// it is gone. Sessions now come from an actual login.
