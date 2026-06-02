"""mikrotik_servers: agregar columna local_address (IP gateway para /ppp/profile)

Revision ID: f1c2d3e45a67
Revises: d8b1f2e34c56
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa


revision = "f1c2d3e45a67"
down_revision = "d8b1f2e34c56"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "mikrotik_servers",
        sa.Column("local_address", sa.String(length=64), nullable=True),
    )


def downgrade():
    op.drop_column("mikrotik_servers", "local_address")
