"""plans: agregar columna rate_limit (string libre para RouterOS /ppp/profile)

Revision ID: d8b1f2e34c56
Revises: e2f9a1b3c4d5
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa


revision = "d8b1f2e34c56"
down_revision = "e2f9a1b3c4d5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "plans",
        sa.Column("rate_limit", sa.String(length=255), nullable=True),
    )


def downgrade():
    op.drop_column("plans", "rate_limit")
