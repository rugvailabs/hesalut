"""booking phase 1: services, bookings, proposed times, business settings

Revision ID: d7a2c5e8b1f4
Revises: c4e9a1b7d2f3
Create Date: 2026-10-04 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd7a2c5e8b1f4'
down_revision: Union[str, None] = 'c4e9a1b7d2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Lets the exclusion constraint compare plain integers (business, staff)
    # alongside the time range.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.add_column('businesses', sa.Column('timezone', sa.String(length=64), nullable=True))
    op.add_column(
        'businesses', sa.Column('cancellation_policy', sa.String(length=1000), nullable=True)
    )
    op.add_column(
        'businesses',
        sa.Column(
            'cancellation_window_hours', sa.SmallInteger(), server_default='24', nullable=False
        ),
    )
    op.drop_constraint('ck_businesses_booking_mode', 'businesses', type_='check')
    op.create_check_constraint(
        'ck_businesses_booking_mode',
        'businesses',
        "booking_mode IN ('none', 'external', 'request') AND "
        "(booking_mode <> 'external' OR booking_url IS NOT NULL)",
    )

    op.create_table(
        'services',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('duration_minutes', sa.SmallInteger(), nullable=False),
        sa.Column('price_cents', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.CheckConstraint('duration_minutes BETWEEN 5 AND 720', name='ck_services_duration'),
        sa.CheckConstraint('price_cents IS NULL OR price_cents >= 0', name='ck_services_price'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_services_business_id', 'services', ['business_id'])

    op.create_table(
        'bookings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('service_id', sa.Integer(), nullable=True),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('staff_key', sa.Integer(), server_default='0', nullable=False),
        sa.Column('status', sa.String(length=16), server_default='requested', nullable=False),
        sa.Column('style', sa.String(length=16), nullable=False),
        sa.Column('service_name', sa.String(length=120), nullable=False),
        sa.Column('duration_minutes', sa.SmallInteger(), nullable=False),
        sa.Column('price_cents', sa.Integer(), nullable=True),
        sa.Column('customer_name', sa.String(length=255), nullable=False),
        sa.Column('customer_email', sa.String(length=320), nullable=False),
        sa.Column('customer_phone', sa.String(length=32), nullable=True),
        sa.Column('note', sa.String(length=1000), nullable=True),
        sa.Column('consent_shared', sa.Boolean(), nullable=False),
        sa.Column('confirmed_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('confirmed_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decline_message', sa.String(length=500), nullable=True),
        sa.Column('cancelled_by', sa.String(length=16), nullable=True),
        sa.Column('cancel_reason', sa.String(length=500), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('requested','confirmed','declined','cancelled','expired','completed','no_show')",
            name='ck_bookings_status',
        ),
        sa.CheckConstraint("style IN ('appointment','window')", name='ck_bookings_style'),
        sa.CheckConstraint(
            "status <> 'confirmed' OR (confirmed_start IS NOT NULL AND confirmed_end > confirmed_start)",
            name='ck_bookings_confirmed_has_time',
        ),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['customer_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bookings_business_status', 'bookings', ['business_id', 'status'])
    op.create_index('ix_bookings_customer', 'bookings', ['customer_id', 'created_at'])
    # Two confirmed bookings for the same business and calendar may not overlap.
    op.execute(
        "ALTER TABLE bookings ADD CONSTRAINT ex_bookings_no_overlap EXCLUDE USING gist ("
        "business_id WITH =, staff_key WITH =, "
        "tstzrange(confirmed_start, confirmed_end) WITH &&) WHERE (status = 'confirmed')"
    )

    op.create_table(
        'booking_proposed_times',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('booking_id', sa.Integer(), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('part_of_day', sa.String(length=16), nullable=True),
        sa.CheckConstraint('ends_at > starts_at', name='ck_proposed_time_order'),
        sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_booking_proposed_times_booking_id', 'booking_proposed_times', ['booking_id'])


def downgrade() -> None:
    op.drop_index('ix_booking_proposed_times_booking_id', table_name='booking_proposed_times')
    op.drop_table('booking_proposed_times')
    op.execute("ALTER TABLE bookings DROP CONSTRAINT ex_bookings_no_overlap")
    op.drop_index('ix_bookings_customer', table_name='bookings')
    op.drop_index('ix_bookings_business_status', table_name='bookings')
    op.drop_table('bookings')
    op.drop_index('ix_services_business_id', table_name='services')
    op.drop_table('services')
    op.drop_constraint('ck_businesses_booking_mode', 'businesses', type_='check')
    op.create_check_constraint(
        'ck_businesses_booking_mode',
        'businesses',
        "booking_mode IN ('none', 'external') AND "
        "(booking_mode <> 'external' OR booking_url IS NOT NULL)",
    )
    op.drop_column('businesses', 'cancellation_window_hours')
    op.drop_column('businesses', 'cancellation_policy')
    op.drop_column('businesses', 'timezone')
