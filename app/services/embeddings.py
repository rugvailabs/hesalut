"""Smart search, layer 2: match listings by meaning, not only by shared words.

    similar(db, q)          {business_id: similarity} for a query; {} when off
    sync(db, ids=None)      (re)embed listings whose text changed; returns count
    sync_in_background(id)  the same for one listing, after an owner edits it

Embeddings come from Voyage AI (voyage-3.5 by default - multilingual, so a
French query finds an English description). They live in business_embeddings,
a pgvector table created by migration b3d8f2a6c9e1.

Off - and search is exactly the keyword search it always was - unless both:
  - VOYAGE_API_KEY is set, and
  - the business_embeddings table exists (pgvector installed)
Any failure while searching (network, timeout, bad response) is logged and
treated as "no meaning matches": semantic search can add results, never break
a search.

Plain urllib rather than an SDK: one small JSON endpoint, and no new
dependency in the deploy image.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import urllib.error
import urllib.request
from collections import OrderedDict
from typing import Iterable

from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.models.business import Business
from app.models.category import Category

logger = logging.getLogger(__name__)

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
#: Listings embedded per request when syncing.
BATCH_SIZE = 64
#: A person is waiting on a search; a slow embedding is skipped, not awaited.
QUERY_TIMEOUT_SECONDS = 4.0
DOCUMENT_TIMEOUT_SECONDS = 60.0


def schema_sql(dimensions: int) -> list[str]:
    """The table, for `scripts.sync_embeddings --setup`. Mirrors migration b3d8f2a6c9e1."""
    return [
        "CREATE EXTENSION IF NOT EXISTS vector",
        f"""
        CREATE TABLE IF NOT EXISTS business_embeddings (
            business_id  integer PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
            model        varchar(64) NOT NULL,
            content_hash char(64) NOT NULL,
            embedding    vector({dimensions}) NOT NULL,
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_business_embeddings_hnsw "
        "ON business_embeddings USING hnsw (embedding vector_cosine_ops)",
    ]


class EmbeddingError(RuntimeError):
    """The embedding request failed; the caller decides whether that matters."""


# -------------------------------------------------------------- availability

_table_checked: dict[str, bool] = {}
_table_lock = threading.Lock()


def _has_table(db: Session) -> bool:
    """Whether business_embeddings exists, checked once per database."""
    key = str(db.get_bind().url)
    with _table_lock:
        if key in _table_checked:
            return _table_checked[key]
    exists = bool(db.scalar(text("SELECT to_regclass('public.business_embeddings') IS NOT NULL")))
    with _table_lock:
        _table_checked[key] = exists
    return exists


def forget_table_check() -> None:
    """After creating the table in a running process (and for tests)."""
    with _table_lock:
        _table_checked.clear()


def is_enabled(db: Session) -> bool:
    if not get_settings().voyage_api_key.strip():
        return False
    try:
        return _has_table(db)
    except Exception:  # noqa: BLE001 - "can't tell" means "off"
        logger.exception("semantic search: could not check for business_embeddings")
        return False


# ------------------------------------------------------------------ requests

def embed(texts: list[str], input_type: str, timeout: float) -> list[list[float]]:
    """Embed `texts` as "query" or "document". Raises EmbeddingError."""
    settings = get_settings()
    body = json.dumps(
        {
            "input": texts,
            "model": settings.embedding_model,
            "input_type": input_type,
            "output_dimension": settings.embedding_dimensions,
        }
    ).encode()
    request = urllib.request.Request(
        VOYAGE_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {settings.voyage_api_key.strip()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        raise EmbeddingError(f"Voyage returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise EmbeddingError(f"Voyage request failed: {exc}") from exc

    try:
        rows = sorted(payload["data"], key=lambda row: row["index"])
        vectors = [row["embedding"] for row in rows]
    except (KeyError, TypeError) as exc:
        raise EmbeddingError("Voyage response had no embeddings") from exc
    if len(vectors) != len(texts) or any(
        len(v) != settings.embedding_dimensions for v in vectors
    ):
        raise EmbeddingError("Voyage returned the wrong number or size of embeddings")
    return vectors


def _literal(vector: list[float]) -> str:
    """pgvector's text form: '[0.1,0.2,...]'."""
    return "[" + ",".join(repr(float(x)) for x in vector) + "]"


# --------------------------------------------------------------------- query

class _QueryCache:
    """Recent query embeddings - the same search twice shouldn't cost twice."""

    def __init__(self, max_items: int = 1000) -> None:
        self._items: OrderedDict[tuple[str, str], list[float]] = OrderedDict()
        self._max = max_items
        self._lock = threading.Lock()

    def get(self, key: tuple[str, str]) -> list[float] | None:
        with self._lock:
            vector = self._items.get(key)
            if vector is not None:
                self._items.move_to_end(key)
            return vector

    def put(self, key: tuple[str, str], vector: list[float]) -> None:
        with self._lock:
            self._items[key] = vector
            self._items.move_to_end(key)
            while len(self._items) > self._max:
                self._items.popitem(last=False)


_query_cache = _QueryCache()


def similar(db: Session, q: str) -> dict[int, float]:
    """Listings whose meaning is close to `q`, with cosine similarity. {} when off."""
    query = " ".join((q or "").split())
    if len(query) < 3 or not is_enabled(db):
        return {}
    settings = get_settings()

    key = (settings.embedding_model, query.lower())
    vector = _query_cache.get(key)
    if vector is None:
        try:
            vector = embed([query], "query", QUERY_TIMEOUT_SECONDS)[0]
        except EmbeddingError as exc:
            logger.warning("semantic search skipped: %s", exc)
            return {}
        _query_cache.put(key, vector)

    try:
        rows = db.execute(
            text(
                "SELECT business_id, 1 - (embedding <=> CAST(:v AS vector)) AS similarity "
                "FROM business_embeddings WHERE model = :model "
                "ORDER BY embedding <=> CAST(:v AS vector) LIMIT :k"
            ),
            {"v": _literal(vector), "model": settings.embedding_model, "k": settings.semantic_max_matches},
        ).all()
    except Exception:  # noqa: BLE001 - a broken index must not break search
        logger.exception("semantic search: similarity query failed")
        db.rollback()
        return {}
    return {
        int(business_id): float(similarity)
        for business_id, similarity in rows
        if similarity is not None and similarity >= settings.semantic_min_similarity
    }


# ------------------------------------------------------------------ documents

def document_text(name: str, category: str | None, description: str | None, city: str | None) -> str:
    """What a listing is embedded from. Changing it re-embeds everything (hash)."""
    parts = [name, category or "", description or "", city or ""]
    return ". ".join(p.strip() for p in parts if p and p.strip())


def _hash(text_: str, model: str) -> str:
    return hashlib.sha256(f"{model}\n{text_}".encode()).hexdigest()


def sync(db: Session, ids: Iterable[int] | None = None) -> int:
    """Embed listings that are new or whose text changed. Returns how many.

    Commits as it goes, one batch at a time, so a failure part-way keeps the
    batches already done. Raises EmbeddingError if the API fails.
    """
    if not is_enabled(db):
        return 0
    settings = get_settings()

    stmt = select(
        Business.id, Business.name, Category.name, Business.description, Business.city
    ).join(Category, Category.id == Business.category_id)
    if ids is not None:
        stmt = stmt.where(Business.id.in_(list(ids)))
    listings = db.execute(stmt).all()

    current = dict(
        db.execute(
            text("SELECT business_id, content_hash FROM business_embeddings WHERE model = :m"),
            {"m": settings.embedding_model},
        ).all()
    )
    stale: list[tuple[int, str, str]] = []
    for business_id, name, category, description, city in listings:
        doc = document_text(name, category, description, city)
        digest = _hash(doc, settings.embedding_model)
        if current.get(business_id) != digest:
            stale.append((business_id, doc, digest))

    done = 0
    for start in range(0, len(stale), BATCH_SIZE):
        batch = stale[start : start + BATCH_SIZE]
        vectors = embed([doc for _, doc, _ in batch], "document", DOCUMENT_TIMEOUT_SECONDS)
        for (business_id, _, digest), vector in zip(batch, vectors):
            db.execute(
                text(
                    "INSERT INTO business_embeddings (business_id, model, content_hash, embedding, updated_at) "
                    "VALUES (:id, :model, :hash, CAST(:v AS vector), now()) "
                    "ON CONFLICT (business_id) DO UPDATE SET model = EXCLUDED.model, "
                    "content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, "
                    "updated_at = now()"
                ),
                {"id": business_id, "model": settings.embedding_model, "hash": digest, "v": _literal(vector)},
            )
        db.commit()
        done += len(batch)
    return done


def sync_in_background(session_factory: sessionmaker, business_id: int) -> None:
    """BackgroundTask body: re-embed one listing after it was saved. Never raises."""
    try:
        with session_factory() as db:
            sync(db, [business_id])
    except Exception:  # noqa: BLE001 - the listing is saved; the sync script catches up
        logger.exception("semantic search: could not embed listing %s", business_id)


__all__ = [
    "EmbeddingError",
    "document_text",
    "embed",
    "forget_table_check",
    "is_enabled",
    "schema_sql",
    "similar",
    "sync",
    "sync_in_background",
]
