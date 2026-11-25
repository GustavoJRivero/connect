"""ONU de SmartOLT cacheada en conexiones

Revision ID: d5a1f3c8e620
Revises: c4d8e2a7f913
Create Date: 2026-11-25

"""
from alembic import op
import sqlalchemy as sa


revision = 'd5a1f3c8e620'
down_revision = 'c4d8e2a7f913'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('connections', sa.Column('onu_external_id', sa.String(length=64), nullable=True))
    op.add_column('connections', sa.Column('onu_type_name', sa.String(length=120), nullable=True))


def downgrade():
    op.drop_column('connections', 'onu_type_name')
    op.drop_column('connections', 'onu_external_id')
