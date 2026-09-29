"""favorites: listings a user saved

Revision ID: e5a1c7d3f9b2
Revises: d9f3b6a1e2c8
Create Date: 2026-09-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a1c7d3f9b2'
down_revision: Union[str, None] = 'd9f3b6a1e2c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'favorites',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'business_id'),
    )
    op.create_index('ix_favorites_business_id', 'favorites', ['business_id'])


def downgrade() -> None:
    op.drop_index('ix_favorites_business_id', table_name='favorites')
    op.drop_table('favorites')
