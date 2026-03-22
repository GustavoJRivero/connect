"""add client_id to users

Revision ID: f2a5d4c83b22
Revises: e1f4c3b92a11
Create Date: 2026-03-21 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f2a5d4c83b22'
down_revision = 'e1f4c3b92a11'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('client_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key('fk_users_client_id', 'users', 'clients', ['client_id'], ['id'])
    op.create_index('ix_users_client_id', 'users', ['client_id'])


def downgrade():
    op.drop_index('ix_users_client_id', table_name='users')
    op.drop_constraint('fk_users_client_id', 'users', type_='foreignkey')
    op.drop_column('users', 'client_id')
