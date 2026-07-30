"""
Visitor geolocation for DISPLAY-ONLY currency selection.

  GET /api/geo   ->  { "country_code": "IN" | null, "source": "ip" | "fallback" }

Unauthenticated and cosmetic: the marketing pricing page calls this to guess
which currency to *show*. It never affects billing. On ANY error — no public IP,
service down, timeout, junk response — we return a null country and the frontend
falls back to USD. Nothing here should ever raise to the caller.

We use ipapi.co's free, keyless endpoint (no signup, HTTPS). If you'd rather not
depend on it, swap `_lookup_country` for another provider or a local GeoIP DB —
the contract (return an ISO alpha-2 code or None) stays the same.
"""
import ipaddress
import logging

import httpx
from fastapi import APIRouter, Request

logger = logging.getLogger("geo")
router = APIRouter(prefix="/api", tags=["geo"])

# Free, keyless IP geolocation. {ip} is filled with the visitor's address.
_GEO_URL = "https://ipapi.co/{ip}/country/"
_TIMEOUT = 3.0


def _client_ip(request: Request) -> str | None:
    """Best-effort real client IP, honouring the proxy chain in front of us.

    Cloud Run / Vercel / nginx set X-Forwarded-For as "client, proxy1, proxy2";
    the first entry is the original visitor. Fall back to the socket peer.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


def _is_public_ip(ip: str | None) -> bool:
    """Only geolocate routable public addresses. Localhost/private/reserved
    ranges (e.g. dev on 127.0.0.1) can't be located and would just error."""
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_reserved
        or addr.is_link_local
        or addr.is_unspecified
    )


async def _lookup_country(ip: str) -> str | None:
    """Return the ISO alpha-2 country code for `ip`, or None on any failure."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(_GEO_URL.format(ip=ip))
        if resp.status_code != 200:
            return None
        code = (resp.text or "").strip().upper()
        # ipapi.co returns a 2-letter code on success, or an error word/blob.
        if len(code) == 2 and code.isalpha():
            return code
        return None
    except Exception as e:  # network error, timeout, bad body — never propagate
        logger.info("geo lookup failed for %s: %s", ip, e)
        return None


@router.get("/geo")
async def geo(request: Request):
    """Best-effort visitor country for currency display. Always 200."""
    ip = _client_ip(request)
    if not _is_public_ip(ip):
        return {"country_code": None, "source": "fallback"}

    country = await _lookup_country(ip)
    if not country:
        return {"country_code": None, "source": "fallback"}
    return {"country_code": country, "source": "ip"}
