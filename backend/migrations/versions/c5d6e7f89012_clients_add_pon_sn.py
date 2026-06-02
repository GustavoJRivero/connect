"""clients: agregar columna pon_sn (Serial Number ONU/PON, opcional)

Revision ID: c5d6e7f89012
Revises: b4c2d3e567f8
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa


revision = "c5d6e7f89012"
down_revision = "b4c2d3e567f8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "clients",
        sa.Column("pon_sn", sa.String(length=64), nullable=True),
    )


def downgrade():
    op.drop_column("clients", "pon_sn")
