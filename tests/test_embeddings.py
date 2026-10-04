"""Smart search, layer 2: the embedding service's own logic.

The Voyage API and the database are stubbed, so these check the parts that
decide whether a search is affected at all: off unless configured, every
failure treated as "no meaning matches", the similarity threshold, the query
cache, and the request we send. No conftest fixtures - runs with --noconftest.
The SQL itself (pgvector) is covered once the Docker test database has it.
"""

from __future__ import annotations

import io
import json
import urllib.error
from types import SimpleNamespace

import pytest

from app.services import embeddings as emb

DIMS = 4


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    s = SimpleNamespace(
        voyage_api_key="pa-test",
        embedding_model="voyage-3.5",
        embedding_dimensions=DIMS,
        semantic_min_similarity=0.45,
        semantic_max_matches=30,
    )
    monkeypatch.setattr(emb, "get_settings", lambda: s)
    monkeypatch.setattr(emb, "_query_cache", emb._QueryCache())
    emb.forget_table_check()
    return s


class FakeDB:
    """Answers the table check and the similarity query."""

    def __init__(self, rows=(), table=True, fail=False):
        self.rows, self.table, self.fail = list(rows), table, fail
        self.queries = []
        self.rolled_back = False

    def get_bind(self):
        return SimpleNamespace(url=f"fake://{id(self)}")

    def scalar(self, stmt):
        return self.table

    def execute(self, stmt, params=None):
        self.queries.append((str(stmt), params))
        if self.fail:
            raise RuntimeError("index broken")
        return SimpleNamespace(all=lambda: self.rows)

    def rollback(self):
        self.rolled_back = True


def voyage_replies(monkeypatch, vectors=None, error=None):
    sent = []

    def fake_urlopen(request, timeout):
        sent.append((request, timeout))
        if error is not None:
            raise error
        body = {"data": [{"index": i, "embedding": v} for i, v in enumerate(vectors)]}
        return io.BytesIO(json.dumps(body).encode())

    monkeypatch.setattr(emb.urllib.request, "urlopen", fake_urlopen)
    return sent


def test_similar_returns_matches_above_the_threshold(monkeypatch):
    sent = voyage_replies(monkeypatch, [[0.1, 0.2, 0.3, 0.4]])
    db = FakeDB(rows=[(7, 0.82), (3, 0.51), (9, 0.30)])

    assert emb.similar(db, "my sink is clogged") == {7: 0.82, 3: 0.51}

    request, timeout = sent[0]
    payload = json.loads(request.data)
    assert payload["input_type"] == "query"
    assert payload["model"] == "voyage-3.5"
    assert request.get_header("Authorization") == "Bearer pa-test"
    assert timeout == emb.QUERY_TIMEOUT_SECONDS


def test_off_without_a_key_or_table(monkeypatch, settings):
    sent = voyage_replies(monkeypatch, [[0.1] * DIMS])
    settings.voyage_api_key = ""
    assert emb.similar(FakeDB(rows=[(1, 0.9)]), "plumber") == {}

    settings.voyage_api_key = "pa-test"
    assert emb.similar(FakeDB(rows=[(1, 0.9)], table=False), "plumber") == {}
    assert sent == []


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError("u", 429, "rate limited", None, None),
        urllib.error.URLError("no network"),
        TimeoutError(),
    ],
    ids=["http-429", "no-network", "timeout"],
)
def test_api_failure_means_no_matches(monkeypatch, error):
    voyage_replies(monkeypatch, error=error)
    assert emb.similar(FakeDB(rows=[(1, 0.9)]), "plumber") == {}


def test_malformed_or_wrong_size_response_means_no_matches(monkeypatch):
    voyage_replies(monkeypatch, [[0.1, 0.2]])  # 2 dims, expected 4
    assert emb.similar(FakeDB(rows=[(1, 0.9)]), "plumber") == {}


def test_database_failure_means_no_matches(monkeypatch):
    voyage_replies(monkeypatch, [[0.1] * DIMS])
    db = FakeDB(fail=True)
    assert emb.similar(db, "plumber") == {}
    assert db.rolled_back


def test_query_embeddings_are_cached(monkeypatch):
    sent = voyage_replies(monkeypatch, [[0.1] * DIMS])
    db = FakeDB(rows=[(1, 0.9)])
    emb.similar(db, "Leaky Faucet")
    emb.similar(db, "leaky   faucet")
    assert len(sent) == 1


def test_very_short_queries_are_skipped(monkeypatch):
    sent = voyage_replies(monkeypatch, [[0.1] * DIMS])
    assert emb.similar(FakeDB(rows=[(1, 0.9)]), "ab") == {}
    assert sent == []


def test_document_text_and_vector_literal():
    assert (
        emb.document_text("Drain Pros", "Plumbers", " Clogged drains. ", "Burnaby")
        == "Drain Pros. Plumbers. Clogged drains.. Burnaby"
    )
    assert emb.document_text("Solo", None, "", None) == "Solo"
    assert emb._literal([0.5, 1, -2.25]) == "[0.5,1.0,-2.25]"
