"""Nombre y apellido de los usuarios del panel.

Revision ID: c9a1f3d20457
Revises: b7d4e6f80912
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa


revision = "c9a1f3d20457"
down_revision = "b7d4e6f80912"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("first_name", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("last_name", sa.String(length=80), nullable=True))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_name")
        batch.drop_column("first_name")
