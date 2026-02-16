"""setting cut_profile to suspended

Revision ID: b2c1e8a3f4d5
Revises: f1b8c4d56a23
Create Date: 2026-01-31

"""
from alembic import op


revision = 'b2c1e8a3f4d5'
down_revision = 'f1b8c4d56a23'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "UPDATE settings SET value = 'suspended' WHERE `key` = 'mikrotik.cut_profile'"
    )


def downgrade():
    pass
