"""businesses.leads_seen_at: when the owner last looked at their leads

Revision ID: h3e6f9c2d5b8
Revises: g2d5e8b1c4a7
Create Date: 2026-10-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h3e6f9c2d5b8'
down_revision: Union[str, None] = 'g2d5e8b1c4a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default now() both backfills the existing rows and starts a new
    # listing with nothing unread. A lead counts as new when it arrived after
    # this moment, so without the backfill every lead already in the database
    # would show up as new the first time an owner opened the dashboard.
    op.add_column(
        'businesses',
        sa.Column(
            'leads_seen_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('businesses', 'leads_seen_at')
