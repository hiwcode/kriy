"""SSRF guard — reject URLs that resolve to non-public addresses.

Shared by every place that fetches a user/LLM-supplied URL server-side
(call_api tool, document URL download, vision image fetch).
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from app.core.config import settings

# The cloud metadata endpoint is never allowed — not even in development.
_METADATA_IP = ipaddress.ip_address("169.254.169.254")


def assert_public_url(url: str) -> None:
    """Raise ValueError unless `url` is http(s) and its host resolves to allowed
    addresses. In production, blocks private/loopback/link-local/reserved ranges and
    the cloud metadata endpoint. In development (ENVIRONMENT != production) the
    private/loopback checks are relaxed so local integrations (e.g. a demo app on
    http://localhost) work — but the metadata endpoint stays blocked."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"unsupported URL scheme: {parsed.scheme or '(none)'}")
    host = parsed.hostname
    if not host:
        raise ValueError("URL has no host")
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as e:
        raise ValueError(f"could not resolve host: {e}") from e
    relaxed = not settings.is_production  # dev: allow localhost/private
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip == _METADATA_IP:
            raise ValueError("host resolves to the cloud metadata endpoint — blocked")
        if relaxed:
            continue
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            raise ValueError(f"host resolves to a non-public address ({ip}) — blocked")


def is_public_url(url: str) -> bool:
    try:
        assert_public_url(url)
        return True
    except ValueError:
        return False
