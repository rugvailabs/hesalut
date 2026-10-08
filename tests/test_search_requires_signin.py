"""Search and listing reads need a signed-in visitor; suggestions stay public."""

from __future__ import annotations

import pytest

from tests.conftest import ANONYMOUS_HEADER

ANON = {ANONYMOUS_HEADER: "1"}

GATED = [
    "/api/v1/businesses/search?q=plumber",
    "/api/v1/search/nearby?lat=49.28&lng=-123.12",
    "/api/v1/search/understand?q=plumber",
    "/api/v1/businesses/by-slug/anything",
    "/api/v1/businesses/1/reviews",
    "/api/v1/businesses/1/reviews/summary",
]

PUBLIC = ["/api/v1/categories", "/api/v1/businesses/cities"]


@pytest.mark.parametrize("path", GATED)
def test_signed_out_visitors_are_refused(client, path):
    r = client.get(path, headers=ANON)

    assert r.status_code == 401, r.text


@pytest.mark.parametrize("path", GATED)
def test_a_garbage_token_is_refused(client, path):
    r = client.get(path, headers={**ANON, "Authorization": "Bearer not-a-token"})

    assert r.status_code == 401


def test_a_signed_in_visitor_can_search(client):
    # The client's default searcher is signed in.
    assert client.get("/api/v1/businesses/search?q=plumber").status_code == 200
    assert client.get("/api/v1/search/understand?q=plumber").status_code == 200


@pytest.mark.parametrize("path", PUBLIC)
def test_suggestion_lists_stay_public(client, path):
    assert client.get(path, headers=ANON).status_code == 200
