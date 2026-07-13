"""SSRF guard — reject URLs that resolve to non-public addresses.

Shared by every place that fetches a user/LLM-supplied URL server-side
(call_api tool, document URL download, vision image fetch).
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


def assert_public_url(url: str) -> None:
    """Raise ValueError unless `url` is http(s) and its host resolves solely to
    public addresses. Blocks private/loopback/link-local/reserved ranges and the
    cloud metadata endpoint (169.254.169.254)."""
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
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            raise ValueError(f"host resolves to a non-public address ({ip}) — blocked")


def is_public_url(url: str) -> bool:
    try:
        assert_public_url(url)
        return True
    except ValueError:
        return False
