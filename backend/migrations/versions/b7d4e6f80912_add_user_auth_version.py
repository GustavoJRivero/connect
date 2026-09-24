"""Invalidate staff and portal JWTs after password changes.

Revision ID: b7d4e6f80912
Revises: a9c1e2f3b4d5
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa


revision = "b7d4e6f80912"
down_revision = "a9c1e2f3b4d5"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("auth_version", sa.Integer(), nullable=False, server_default="1"))
    with op.batch_alter_table("client_portal_accounts") as batch:
        batch.add_column(sa.Column("auth_version", sa.Integer(), nullable=False, server_default="1"))


def downgrade():
    with op.batch_alter_table("client_portal_accounts") as batch:
        batch.drop_column("auth_version")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("auth_version")
