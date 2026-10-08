"""price level from services: who set businesses.price_range, and a backfill

Revision ID: g2d5e8b1c4a7
Revises: f6c3d9a2e7b1
Create Date: 2026-10-05 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g2d5e8b1c4a7'
down_revision: Union[str, None] = 'f6c3d9a2e7b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'businesses',
        sa.Column('price_range_source', sa.String(length=8), server_default='services', nullable=False),
    )
    op.create_check_constraint(
        'ck_businesses_price_range_source',
        'businesses',
        "price_range_source IN ('owner', 'services')",
    )
    # Anything already filled in was put there by a person (an owner, or the
    # demo data): keep it, and never overwrite it from service prices.
    op.execute("UPDATE businesses SET price_range_source = 'owner' WHERE price_range IS NOT NULL")
    # Everything else may now take a level from its services. Median of the
    # active, priced (> $0) services; bands match app/services/price_level.py:
    # under $50 "$", under $150 "$$", under $400 "$$$", otherwise "$$$$".
    op.execute(
        """
        UPDATE businesses b
        SET price_range = CASE
            WHEN s.typical < 5000 THEN '$'
            WHEN s.typical < 15000 THEN '$$'
            WHEN s.typical < 40000 THEN '$$$'
            ELSE '$$$$'
        END
        FROM (
            SELECT business_id,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) AS typical
            FROM services
            WHERE is_active AND price_cents > 0
            GROUP BY business_id
        ) s
        WHERE s.business_id = b.id AND b.price_range_source = 'services'
        """
    )


def downgrade() -> None:
    # Derived levels are removed again; levels an owner chose are kept.
    op.execute("UPDATE businesses SET price_range = NULL WHERE price_range_source = 'services'")
    op.drop_constraint('ck_businesses_price_range_source', 'businesses', type_='check')
    op.drop_column('businesses', 'price_range_source')
