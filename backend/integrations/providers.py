"""
Provider registry for the OAuth2 authorization-code flow.

Each provider is described declaratively. Secrets are **never** hardcoded — the
client id / secret (and, for custom providers, the endpoints) are read from
environment variables at call time:

    {SLUG}_CLIENT_ID
    {SLUG}_CLIENT_SECRET
    {SLUG}_SCOPES            (optional, space-separated, overrides default_scopes)
    {SLUG}_AUTHORIZE_URL     (optional, required only for custom providers)
    {SLUG}_TOKEN_URL         (optional, required only for custom providers)

The redirect URI is derived from PUBLIC_BASE_URL so it matches what you register
with each provider:  {PUBLIC_BASE_URL}/api/integrations/{slug}/callback
"""
import os
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass(frozen=True)
class Provider:
    slug: str
    name: str
    authorize_url: str = ""          # empty -> read from {SLUG}_AUTHORIZE_URL
    token_url: str = ""              # empty -> read from {SLUG}_TOKEN_URL
    default_scopes: str = ""
    # Extra query params appended to the authorize URL (e.g. Google offline access).
    authorize_extras: Dict[str, str] = field(default_factory=dict)
    revoke_url: Optional[str] = None


# Well-known, publicly-documented standard OAuth2 providers.
_REGISTRY: Dict[str, Provider] = {
    "google": Provider(
        slug="google", name="Google Workspace",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        default_scopes="openid email profile https://www.googleapis.com/auth/contacts.readonly",
        authorize_extras={"access_type": "offline", "prompt": "consent", "include_granted_scopes": "true"},
        revoke_url="https://oauth2.googleapis.com/revoke",
    ),
    "microsoft": Provider(
        slug="microsoft", name="Microsoft 365",
        authorize_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",
        default_scopes="offline_access User.Read Contacts.Read",
    ),
    "linkedin": Provider(
        slug="linkedin", name="LinkedIn",
        authorize_url="https://www.linkedin.com/oauth/v2/authorization",
        token_url="https://www.linkedin.com/oauth/v2/accessToken",
        # r_ads_leadgen enables pulling Lead Gen Form responses.
        default_scopes="r_liteprofile r_emailaddress r_ads_leadgen",
    ),
    "facebook": Provider(
        slug="facebook", name="Facebook Leads",
        authorize_url="https://www.facebook.com/v19.0/dialog/oauth",
        token_url="https://graph.facebook.com/v19.0/oauth/access_token",
        default_scopes="email pages_show_list leads_retrieval pages_manage_metadata",
    ),
    "hubspot": Provider(
        slug="hubspot", name="HubSpot",
        authorize_url="https://app.hubspot.com/oauth/authorize",
        token_url="https://api.hubapi.com/oauth/v1/token",
        default_scopes="crm.objects.contacts.read crm.objects.deals.read oauth",
    ),
    "salesforce": Provider(
        slug="salesforce", name="Salesforce",
        authorize_url="https://login.salesforce.com/services/oauth2/authorize",
        token_url="https://login.salesforce.com/services/oauth2/token",
        default_scopes="api refresh_token",
        revoke_url="https://login.salesforce.com/services/oauth2/revoke",
    ),
    "zoho": Provider(
        slug="zoho", name="Zoho",
        authorize_url="https://accounts.zoho.com/oauth/v2/auth",
        token_url="https://accounts.zoho.com/oauth/v2/token",
        default_scopes="ZohoCRM.modules.ALL",
        authorize_extras={"access_type": "offline", "prompt": "consent"},
    ),
    "pipedrive": Provider(
        slug="pipedrive", name="Pipedrive",
        authorize_url="https://oauth.pipedrive.com/oauth/authorize",
        token_url="https://oauth.pipedrive.com/oauth/token",
        default_scopes="deals:read contacts:read leads:read",
    ),
    "slack": Provider(
        slug="slack", name="Slack",
        authorize_url="https://slack.com/oauth/v2/authorize",
        token_url="https://slack.com/api/oauth.v2.access",
        default_scopes="channels:read chat:write",
    ),
    # Custom / non-well-known provider: endpoints come from env vars.
    "sangam": Provider(
        slug="sangam", name="Sangam CRM",
        default_scopes="leads.read contacts.read deals.read",
    ),
}


def _env(slug: str, key: str) -> Optional[str]:
    return os.environ.get(f"{slug.upper()}_{key}")


def get_provider(slug: str) -> Provider:
    base = _REGISTRY.get(slug)
    if base is None:
        raise KeyError(slug)
    # Allow env to override endpoints/scopes (and supply them for custom providers).
    return Provider(
        slug=base.slug,
        name=base.name,
        authorize_url=_env(slug, "AUTHORIZE_URL") or base.authorize_url,
        token_url=_env(slug, "TOKEN_URL") or base.token_url,
        default_scopes=_env(slug, "SCOPES") or base.default_scopes,
        authorize_extras=base.authorize_extras,
        revoke_url=base.revoke_url,
    )


def client_credentials(slug: str):
    """Read (client_id, client_secret) strictly from environment variables."""
    return _env(slug, "CLIENT_ID"), _env(slug, "CLIENT_SECRET")


def is_configured(slug: str) -> bool:
    """A provider is usable only when its credentials and endpoints are present."""
    if slug not in _REGISTRY:
        return False
    cid, secret = client_credentials(slug)
    p = get_provider(slug)
    return bool(cid and secret and p.authorize_url and p.token_url)


def known_slugs():
    return list(_REGISTRY.keys())
