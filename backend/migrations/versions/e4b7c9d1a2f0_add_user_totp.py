"""TOTP en usuarios y método de challenge de login.

Revision ID: e4b7c9d1a2f0
Revises: d1e2f3a4b5c6
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa


revision = "e4b7c9d1a2f0"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("totp_secret", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="0"))
    with op.batch_alter_table("login_challenges") as batch:
        batch.add_column(sa.Column("method", sa.String(length=16), nullable=False, server_default="email"))


def downgrade():
    with op.batch_alter_table("login_challenges") as batch:
        batch.drop_column("method")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("totp_enabled")
        batch.drop_column("totp_secret")
