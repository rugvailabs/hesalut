"""Embed every listing for meaning-based search (smart search layer 2).

Listings are also re-embedded when an owner saves them; this catches up
everything else - the first run, seeded or imported listings, and anything a
failed background task missed. Only listings whose text changed since their
last embedding are sent, so re-running is cheap.

    python -m scripts.sync_embeddings            # embed new/changed listings
    python -m scripts.sync_embeddings --setup    # first create the pgvector table
                                                 # (if the migration skipped it)

Needs VOYAGE_API_KEY, and pgvector on the database.
"""

from __future__ import annotations

import sys

from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.services import embeddings


def main() -> int:
    settings = get_settings()
    if not settings.voyage_api_key.strip():
        print("VOYAGE_API_KEY is not set - nothing to do.")
        return 1

    db = SessionLocal()
    try:
        if "--setup" in sys.argv:
            for statement in embeddings.schema_sql(settings.embedding_dimensions):
                db.execute(text(statement))
            db.commit()
            embeddings.forget_table_check()
            print("business_embeddings is ready.")

        if not embeddings.is_enabled(db):
            print("business_embeddings does not exist. Install pgvector, then run with --setup.")
            return 1

        done = embeddings.sync(db)
        print(f"Embedded {done} listing(s); the rest were already up to date.")
    except embeddings.EmbeddingError as exc:
        print(f"Embedding failed: {exc}")
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
