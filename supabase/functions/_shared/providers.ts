// Provider registry for the OAuth2 authorization-code flow.
// Client id/secret (and endpoints for custom providers) come from Edge Function
// secrets set via `supabase secrets set` — never hardcoded, never in the browser.
//
//   {SLUG}_CLIENT_ID, {SLUG}_CLIENT_SECRET
//   {SLUG}_SCOPES        (optional override)
//   {SLUG}_AUTHORIZE_URL, {SLUG}_TOKEN_URL   (required for custom providers)

export interface Provider {
  slug: string;
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  extras: Record<string, string>;
}

const BASE: Record<string, Omit<Provider, "extras"> & { extras?: Record<string, string> }> = {
  google: {
    slug: "google", name: "Google Workspace",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "openid email profile https://www.googleapis.com/auth/contacts.readonly",
    extras: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    slug: "microsoft", name: "Microsoft 365",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: "offline_access User.Read Contacts.Read",
  },
  linkedin: {
    slug: "linkedin", name: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: "r_liteprofile r_emailaddress r_ads_leadgen",
  },
  facebook: {
    slug: "facebook", name: "Facebook Leads",
    authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: "email pages_show_list leads_retrieval pages_manage_metadata",
  },
  hubspot: {
    slug: "hubspot", name: "HubSpot",
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: "crm.objects.contacts.read crm.objects.deals.read oauth",
  },
  salesforce: {
    slug: "salesforce", name: "Salesforce",
    authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: "api refresh_token",
  },
  zoho: {
    slug: "zoho", name: "Zoho",
    authorizeUrl: "https://accounts.zoho.com/oauth/v2/auth",
    tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
    scopes: "ZohoCRM.modules.ALL",
    extras: { access_type: "offline", prompt: "consent" },
  },
  pipedrive: {
    slug: "pipedrive", name: "Pipedrive",
    authorizeUrl: "https://oauth.pipedrive.com/oauth/authorize",
    tokenUrl: "https://oauth.pipedrive.com/oauth/token",
    scopes: "deals:read contacts:read leads:read",
  },
  slack: {
    slug: "slack", name: "Slack",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: "channels:read chat:write",
  },
  // Custom provider — endpoints supplied via env.
  sangam: {
    slug: "sangam", name: "Sangam CRM",
    authorizeUrl: "", tokenUrl: "",
    scopes: "leads.read contacts.read deals.read",
  },
};

const env = (slug: string, key: string) => Deno.env.get(`${slug.toUpperCase()}_${key}`) ?? undefined;

export function getProvider(slug: string): Provider {
  const b = BASE[slug];
  if (!b) throw new Error(`Unknown platform: ${slug}`);
  return {
    slug: b.slug,
    name: b.name,
    authorizeUrl: env(slug, "AUTHORIZE_URL") ?? b.authorizeUrl,
    tokenUrl: env(slug, "TOKEN_URL") ?? b.tokenUrl,
    scopes: env(slug, "SCOPES") ?? b.scopes,
    extras: b.extras ?? {},
  };
}

export function clientCreds(slug: string): [string | undefined, string | undefined] {
  return [env(slug, "CLIENT_ID"), env(slug, "CLIENT_SECRET")];
}

export function isConfigured(slug: string): boolean {
  if (!BASE[slug]) return false;
  const [id, secret] = clientCreds(slug);
  const p = getProvider(slug);
  return Boolean(id && secret && p.authorizeUrl && p.tokenUrl);
}

export const knownSlugs = () => Object.keys(BASE);
