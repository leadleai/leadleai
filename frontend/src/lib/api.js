// OAuth integration API.
//
// This used to query Supabase directly from the browser under an ANONYMOUS
// session. Connections are per-ORGANIZATION now, so everything goes through
// FastAPI, which verifies the caller's JWT and resolves their org before
// touching integration_tokens.

import { integrationsApi } from "@/lib/backend";
import { supabaseConfigured } from "@/lib/supabase";

// Maps a UI integration name to its backend provider slug.
export const PLATFORM_BY_NAME = {
  "Google Workspace": "google",
  "Microsoft 365": "microsoft",
  Slack: "slack",
  HubSpot: "hubspot",
  Salesforce: "salesforce",
  Pipedrive: "pipedrive",
  Zoho: "zoho",
  LinkedIn: "linkedin",
  "Sangam CRM": "sangam",
  "Facebook Leads": "facebook",
};

const ALL_SLUGS = Object.values(PLATFORM_BY_NAME);

export const backendConfigured = supabaseConfigured;

export const oauthApi = {
  configured: supabaseConfigured,

  // { connected: [{platform, scope, connected_at}], available: [slug…] } | null
  async listConnections() {
    try {
      const data = await integrationsApi.list();
      return {
        connected: data.connected || [],
        // The authorize call is the source of truth for "configured"; the UI
        // treats all providers as available and surfaces a clear error if a
        // provider's secrets aren't set on the server.
        available: data.available?.length ? data.available : ALL_SLUGS,
      };
    } catch {
      return null; // backend unreachable / not signed in -> demo mode
    }
  },

  // Fetch the provider consent URL, then full-page redirect (standard OAuth).
  async startAuthorize(platform) {
    const data = await integrationsApi.authorize(platform);
    if (!data?.authorization_url) throw new Error("No authorization URL returned");
    window.location.href = data.authorization_url;
  },

  // Backed by RLS: you can only delete your own org's connection.
  async disconnect(platform) {
    return integrationsApi.disconnect(platform);
  },
};
