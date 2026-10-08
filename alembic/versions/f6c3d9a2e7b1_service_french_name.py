"""services: optional French name, copied onto bookings

Revision ID: f6c3d9a2e7b1
Revises: e1f4b8c2a9d6
Create Date: 2026-10-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6c3d9a2e7b1'
down_revision: Union[str, None] = 'e1f4b8c2a9d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('services', sa.Column('name_fr', sa.String(length=120), nullable=True))
    # Copied onto the booking with the English name, so a later edit to the
    # service never rewrites what the customer booked.
    op.add_column('bookings', sa.Column('service_name_fr', sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column('bookings', 'service_name_fr')
    op.drop_column('services', 'name_fr')
