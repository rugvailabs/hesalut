"""booking phase 0: external booking link and its click counter

Revision ID: c4e9a1b7d2f3
Revises: f2b7d4a9c1e6
Create Date: 2026-10-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e9a1b7d2f3'
down_revision: Union[str, None] = 'f2b7d4a9c1e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'businesses',
        sa.Column('booking_mode', sa.String(length=16), server_default='none', nullable=False),
    )
    op.add_column('businesses', sa.Column('booking_url', sa.String(length=512), nullable=True))
    op.create_check_constraint(
        'ck_businesses_booking_mode',
        'businesses',
        "booking_mode IN ('none', 'external') AND "
        "(booking_mode <> 'external' OR booking_url IS NOT NULL)",
    )
    op.create_table(
        'booking_link_clicks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_booking_link_clicks_business_created',
        'booking_link_clicks',
        ['business_id', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_booking_link_clicks_business_created', table_name='booking_link_clicks')
    op.drop_table('booking_link_clicks')
    op.drop_constraint('ck_businesses_booking_mode', 'businesses', type_='check')
    op.drop_column('businesses', 'booking_url')
    op.drop_column('businesses', 'booking_mode')
