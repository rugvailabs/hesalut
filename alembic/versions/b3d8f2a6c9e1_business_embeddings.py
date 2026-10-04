"""business embeddings: meaning-based search (smart search, layer 2)

One embedding per listing, from its name, category, description and city, so a
query can match by meaning ("my sink is clogged" -> a drain specialist) and
not only by shared words. Written and read by app/services/embeddings.py.

Needs the pgvector extension. Where it is not installed (the stock postgres
image, some managed databases) this migration creates nothing and says so:
semantic matching then stays off and search is plain keyword search, exactly
as before. Install pgvector, then run `python -m scripts.sync_embeddings
--setup` to create the table later without a new migration.

The vector width must match settings.embedding_dimensions (1024 for
voyage-3.5).

Revision ID: b3d8f2a6c9e1
Revises: a7c3e9f1b2d4
Create Date: 2026-09-30 18:00:00.000000

"""
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3d8f2a6c9e1'
down_revision: Union[str, None] = 'a7c3e9f1b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")

DIMENSIONS = 1024

# Kept in step with app/services/embeddings.py SCHEMA_SQL.
SCHEMA_SQL = [
    "CREATE EXTENSION IF NOT EXISTS vector",
    f"""
    CREATE TABLE IF NOT EXISTS business_embeddings (
        business_id  integer PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
        model        varchar(64) NOT NULL,
        content_hash char(64) NOT NULL,
        embedding    vector({DIMENSIONS}) NOT NULL,
        updated_at   timestamptz NOT NULL DEFAULT now()
    )
    """,
    # Cosine distance is what the search orders by. HNSW needs pgvector 0.5+.
    "CREATE INDEX IF NOT EXISTS ix_business_embeddings_hnsw "
    "ON business_embeddings USING hnsw (embedding vector_cosine_ops)",
]


def upgrade() -> None:
    conn = op.get_bind()
    available = conn.execute(
        sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'")
    ).first()
    if available is None:
        log.warning(
            "pgvector is not installed on this database: skipping business_embeddings. "
            "Semantic search stays off until it is (see this migration's docstring)."
        )
        return
    for statement in SCHEMA_SQL:
        conn.execute(sa.text(statement))


def downgrade() -> None:
    # The extension is left installed: other things may use it.
    op.execute("DROP TABLE IF EXISTS business_embeddings")
