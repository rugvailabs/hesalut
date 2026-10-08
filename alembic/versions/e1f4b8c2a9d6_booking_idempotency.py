"""booking requests: idempotency key

Revision ID: e1f4b8c2a9d6
Revises: d7a2c5e8b1f4
Create Date: 2026-10-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f4b8c2a9d6'
down_revision: Union[str, None] = 'd7a2c5e8b1f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('idempotency_key', sa.String(length=64), nullable=True))
    # A fingerprint of what was asked for, so reusing a key for a different
    # request is refused instead of silently returning the wrong booking.
    op.add_column('bookings', sa.Column('request_hash', sa.String(length=64), nullable=True))
    op.create_index(
        'uq_bookings_customer_idempotency_key',
        'bookings',
        ['customer_id', 'idempotency_key'],
        unique=True,
        postgresql_where=sa.text('idempotency_key IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_bookings_customer_idempotency_key', table_name='bookings')
    op.drop_column('bookings', 'request_hash')
    op.drop_column('bookings', 'idempotency_key')
