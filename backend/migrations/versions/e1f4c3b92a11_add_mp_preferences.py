"""add mp_preferences table

Revision ID: e1f4c3b92a11
Revises: c3f7d2e89a01
Create Date: 2026-03-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e1f4c3b92a11'
down_revision = 'c3f7d2e89a01'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'mp_preferences',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('preference_id', sa.String(128), nullable=True),
        sa.Column('client_id', sa.BigInteger(), nullable=False),
        sa.Column('invoice_ids_json', sa.Text(), nullable=False),
        sa.Column('total', sa.Numeric(12, 2), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('payment_id', sa.BigInteger(), nullable=True),
        sa.Column('mp_payment_id', sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id']),
        sa.ForeignKeyConstraint(['payment_id'], ['payments.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('preference_id'),
    )
    op.create_index('ix_mp_preferences_preference_id', 'mp_preferences', ['preference_id'])
    op.create_index('ix_mp_preferences_client_id', 'mp_preferences', ['client_id'])
    op.create_index('ix_mp_preferences_status', 'mp_preferences', ['status'])
    op.create_index('ix_mp_preferences_mp_payment_id', 'mp_preferences', ['mp_payment_id'])


def downgrade():
    op.drop_index('ix_mp_preferences_mp_payment_id', table_name='mp_preferences')
    op.drop_index('ix_mp_preferences_status', table_name='mp_preferences')
    op.drop_index('ix_mp_preferences_client_id', table_name='mp_preferences')
    op.drop_index('ix_mp_preferences_preference_id', table_name='mp_preferences')
    op.drop_table('mp_preferences')
