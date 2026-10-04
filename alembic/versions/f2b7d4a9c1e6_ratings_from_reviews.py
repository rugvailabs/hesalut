"""ratings from reviews: replace seeded placeholder ratings with real ones

Most seeded listings carried a rating and review count with no reviews behind
them. From here on those two columns are only ever derived from
business_reviews (app/services/ratings.py); this brings existing rows in line.
A listing with no reviews becomes NULL / 0 - "No reviews yet".

Data only, no schema change. The downgrade is a no-op: the placeholder numbers
were fiction and are not worth restoring.

Revision ID: f2b7d4a9c1e6
Revises: b3d8f2a6c9e1
Create Date: 2026-09-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f2b7d4a9c1e6'
down_revision: Union[str, None] = 'b3d8f2a6c9e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Same arithmetic as recalculate_rating(): average rounded to 2 places,
    # NULL when there are no reviews. Plain SQL so the migration does not
    # depend on application models that may change later.
    op.execute(
        """
        UPDATE businesses AS b
        SET rating = agg.rating,
            review_count = agg.review_count
        FROM (
            SELECT b2.id,
                   ROUND(AVG(r.rating), 2)::double precision AS rating,
                   COUNT(r.id) AS review_count
            FROM businesses AS b2
            LEFT JOIN business_reviews AS r ON r.business_id = b2.id
            GROUP BY b2.id
        ) AS agg
        WHERE agg.id = b.id
          AND (b.rating IS DISTINCT FROM agg.rating
               OR b.review_count IS DISTINCT FROM agg.review_count)
        """
    )


def downgrade() -> None:
    pass
