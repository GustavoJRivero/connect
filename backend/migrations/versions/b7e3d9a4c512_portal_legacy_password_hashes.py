"""client portal accounts: legacy password hashes

Revision ID: b7e3d9a4c512
Revises: f2a6c8e1d047
Create Date: 2026-11-07

"""
from alembic import op
import sqlalchemy as sa


revision = 'b7e3d9a4c512'
down_revision = 'f2a6c8e1d047'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('client_portal_accounts', sa.Column('legacy_password_hashes', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('client_portal_accounts', 'legacy_password_hashes')
