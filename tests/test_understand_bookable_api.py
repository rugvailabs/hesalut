"""GET /search/understand carries the bookable flag to the client."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import llm, query_understanding as qu
from app.services.query_understanding import SearchIntent


@pytest.fixture(autouse=True)
def stubbed_model(monkeypatch):
    qu.reset_caches()
    categories = [SimpleNamespace(slug="dentists", name="Dentists", description="Teeth")]
    monkeypatch.setattr(qu, "_catalogue", lambda db: (categories, ["Vancouver"]))
    monkeypatch.setattr(llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        llm,
        "parse",
        lambda **kw: SearchIntent(
            category_slugs=["dentists"], cities=[], postal_code=None, near_me=False, hours=[],
            min_rating="any", price_levels=[], bookable=True, keywords=None, unsupported=[],
            summary="Dentists you can book online",
        ),
    )
    yield
    qu.reset_caches()


def test_endpoint_returns_bookable(client):
    r = client.get("/api/v1/search/understand", params={"q": "a dentist where I can book online"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "ai" and body["bookable"] is True
    assert body["category_slugs"] == ["dentists"] and body["keywords"] is None


def test_endpoint_defaults_to_not_bookable_for_a_plain_search(client):
    r = client.get("/api/v1/search/understand", params={"q": "Dentists"})  # the name shortcut, no model
    assert r.status_code == 200 and r.json()["bookable"] is False
