"""A small in-memory rate limiter, used as a route dependency.

Sliding window per (bucket, client IP). State lives in the process, so with N
workers the effective limit is N times the stated one, and a restart clears it.
That is acceptable for the single-instance deployment this runs on; swap the
store for Redis if the API is ever scaled out.
"""

from __future__ import annotations

import hmac
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

from app.core.config import get_settings

_lock = threading.Lock()
_hits: dict[tuple[str, str], deque[float]] = {}
_MAX_KEYS = 50_000


def client_ip(request: Request) -> str:
    """The caller's address.

    The web server proxies browser traffic, so it presents a shared secret and
    names the visitor in X-Client-IP; that is believed only when the secret
    matches, so nobody else can choose their own bucket.

    Behind a proxy (Render, Vercel) the proxy appends the real peer to
    X-Forwarded-For, so the *last* entry is trustworthy; earlier ones are
    whatever the client sent and can be forged to dodge the limit.
    """
    secret = get_settings().trusted_proxy_secret
    named = request.headers.get("x-client-ip")
    if (
        secret
        and named
        and hmac.compare_digest(request.headers.get("x-proxy-secret", ""), secret)
    ):
        return named.strip()[:64]
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def reset() -> None:
    """Forget all counters (tests)."""
    with _lock:
        _hits.clear()


def rate_limit(bucket: str, limit: int, window_seconds: int):
    """Dependency allowing `limit` requests per `window_seconds` per client."""

    def dependency(request: Request) -> None:
        if not get_settings().rate_limit_enabled:
            return
        now = time.monotonic()
        key = (bucket, client_ip(request))
        with _lock:
            if len(_hits) > _MAX_KEYS:
                # Drop idle keys so a flood of distinct IPs cannot grow memory.
                for k in [k for k, q in _hits.items() if not q or now - q[-1] > window_seconds]:
                    del _hits[k]
            q = _hits.setdefault(key, deque())
            while q and now - q[0] > window_seconds:
                q.popleft()
            if len(q) >= limit:
                retry = max(1, int(window_seconds - (now - q[0])) + 1)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again shortly.",
                    headers={"Retry-After": str(retry)},
                )
            q.append(now)

    return dependency
