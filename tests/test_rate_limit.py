"""Per-IP rate limiting on the abuse-prone public routes."""

from __future__ import annotations


def _login(client, ip="203.0.113.7"):
    return client.post(
        "/login",
        json={"email": "nobody@example.com", "password": "wrong-password"},
        headers={"x-forwarded-for": ip},
    )


def test_login_is_throttled_after_ten_attempts(client):
    for _ in range(10):
        assert _login(client).status_code == 401
    blocked = _login(client)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1


def test_limit_is_per_client(client):
    for _ in range(10):
        _login(client, "203.0.113.7")
    assert _login(client, "203.0.113.7").status_code == 429
    assert _login(client, "198.51.100.9").status_code == 401


def test_spoofed_leading_forwarded_entry_does_not_evade(client):
    # The proxy appends the real peer last; a client-supplied prefix is ignored.
    for i in range(10):
        _login(client, f"10.0.0.{i}, 203.0.113.7")
    assert _login(client, "10.9.9.9, 203.0.113.7").status_code == 429


def test_can_be_disabled(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "rate_limit_enabled", False)
    for _ in range(15):
        assert _login(client).status_code == 401


def test_trusted_proxy_can_name_the_visitor(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "trusted_proxy_secret", "s3cret")

    def login_as(visitor, secret="s3cret"):
        return client.post(
            "/login",
            json={"email": "nobody@example.com", "password": "wrong-password"},
            headers={"x-forwarded-for": "76.76.21.1", "x-client-ip": visitor, "x-proxy-secret": secret},
        )

    for _ in range(10):
        login_as("198.51.100.1")
    assert login_as("198.51.100.1").status_code == 429
    # A different visitor behind the same proxy address is unaffected.
    assert login_as("198.51.100.2").status_code == 401
    # A wrong secret is ignored: the caller lands in the proxy's own bucket.
    assert login_as("198.51.100.3", secret="guess").status_code == 401
    for _ in range(10):
        login_as("198.51.100.4", secret="guess")
    assert login_as("198.51.100.5", secret="guess").status_code == 429
