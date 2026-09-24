"""IPs de confianza para saltear el código de ingreso.

Revision ID: d1e2f3a4b5c6
Revises: c9a1f3d20457
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa


revision = "d1e2f3a4b5c6"
down_revision = "c9a1f3d20457"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "staff_trusted_ips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "ip", name="uq_staff_trusted_ip"),
    )
    op.create_index(op.f("ix_staff_trusted_ips_user_id"), "staff_trusted_ips", ["user_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_staff_trusted_ips_user_id"), table_name="staff_trusted_ips")
    op.drop_table("staff_trusted_ips")
