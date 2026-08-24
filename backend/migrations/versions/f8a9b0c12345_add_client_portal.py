"""Portal de cliente: credenciales, avisos y checkouts Mercado Pago.

Revision ID: f8a9b0c12345
Revises: e7f8a9b01234
Create Date: 2026-08-21
"""
from alembic import op
import sqlalchemy as sa


revision = "f8a9b0c12345"
down_revision = "e7f8a9b01234"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "client_portal_accounts",
        sa.Column("client_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.PrimaryKeyConstraint("client_id"),
    )
    op.create_table(
        "client_notifications",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("client_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=True),
        sa.Column("invoice_id", sa.BigInteger(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_client_notifications_client_id", "client_notifications", ["client_id"])
    op.create_index("ix_client_notifications_created_at", "client_notifications", ["created_at"])
    op.create_index("ix_client_notifications_invoice_id", "client_notifications", ["invoice_id"])
    op.create_index("ix_client_notifications_read_at", "client_notifications", ["read_at"])
    op.create_table(
        "mp_checkouts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("client_id", sa.BigInteger(), nullable=False),
        sa.Column("invoice_id", sa.BigInteger(), nullable=False),
        sa.Column("preference_id", sa.String(length=80), nullable=False),
        sa.Column("init_point", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("mp_payment_id", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("preference_id"),
    )
    op.create_index("ix_mp_checkouts_client_id", "mp_checkouts", ["client_id"])
    op.create_index("ix_mp_checkouts_invoice_id", "mp_checkouts", ["invoice_id"])
    op.create_index("ix_mp_checkouts_mp_payment_id", "mp_checkouts", ["mp_payment_id"])


def downgrade():
    op.drop_table("mp_checkouts")
    op.drop_table("client_notifications")
    op.drop_table("client_portal_accounts")
