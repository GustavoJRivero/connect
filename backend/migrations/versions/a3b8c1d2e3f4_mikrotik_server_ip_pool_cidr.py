"""mikrotik_servers: agregar columna ip_pool_cidr (pool gestionado por la app)

Revision ID: a3b8c1d2e3f4
Revises: f1c2d3e45a67
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa


revision = "a3b8c1d2e3f4"
down_revision = "f1c2d3e45a67"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "mikrotik_servers",
        sa.Column("ip_pool_cidr", sa.String(length=64), nullable=True),
    )


def downgrade():
    op.drop_column("mikrotik_servers", "ip_pool_cidr")
