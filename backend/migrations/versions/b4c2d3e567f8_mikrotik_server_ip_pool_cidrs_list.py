"""mikrotik_servers: reemplazar ip_pool_cidr (single) por ip_pool_cidrs (JSON list)

Revision ID: b4c2d3e567f8
Revises: a3b8c1d2e3f4
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "b4c2d3e567f8"
down_revision = "a3b8c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "mikrotik_servers",
        sa.Column("ip_pool_cidrs", sa.Text(), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE mikrotik_servers
            SET ip_pool_cidrs = JSON_ARRAY(ip_pool_cidr)
            WHERE ip_pool_cidr IS NOT NULL AND ip_pool_cidr <> ''
            """
        )
    )
    op.drop_column("mikrotik_servers", "ip_pool_cidr")


def downgrade():
    op.add_column(
        "mikrotik_servers",
        sa.Column("ip_pool_cidr", sa.String(length=64), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE mikrotik_servers
            SET ip_pool_cidr = JSON_UNQUOTE(JSON_EXTRACT(ip_pool_cidrs, '$[0]'))
            WHERE ip_pool_cidrs IS NOT NULL AND JSON_LENGTH(ip_pool_cidrs) > 0
            """
        )
    )
    op.drop_column("mikrotik_servers", "ip_pool_cidrs")
