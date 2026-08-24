"""Ordenes de instalación (tickets de técnico + reserva de puerto NAP).

Revision ID: e7f8a9b01234
Revises: d6e7f8901234
Create Date: 2026-07-17
"""
from alembic import op
import sqlalchemy as sa


revision = "e7f8a9b01234"
down_revision = "d6e7f8901234"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "installation_orders",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("client_id", sa.BigInteger(), nullable=False),
        sa.Column("connection_id", sa.BigInteger(), nullable=True),
        sa.Column("location_url", sa.String(length=1000), nullable=True),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("nap_ref", sa.String(length=120), nullable=True),
        sa.Column("nap_name", sa.String(length=200), nullable=True),
        sa.Column("fiber_meters", sa.Numeric(10, 2), nullable=True),
        sa.Column("availability_json", sa.Text(), nullable=True),
        sa.Column("install_calc_json", sa.Text(), nullable=True),
        sa.Column("reserved_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("expired_at", sa.DateTime(), nullable=True),
        sa.Column("last_maps_error", sa.String(length=500), nullable=True),
        sa.Column("technician", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["connection_id"], ["connections.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_installation_orders_created_at"), "installation_orders", ["created_at"], unique=False)
    op.create_index(op.f("ix_installation_orders_client_id"), "installation_orders", ["client_id"], unique=False)
    op.create_index(op.f("ix_installation_orders_connection_id"), "installation_orders", ["connection_id"], unique=False)
    op.create_index(op.f("ix_installation_orders_status"), "installation_orders", ["status"], unique=False)
    op.create_index(op.f("ix_installation_orders_expires_at"), "installation_orders", ["expires_at"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_installation_orders_expires_at"), table_name="installation_orders")
    op.drop_index(op.f("ix_installation_orders_status"), table_name="installation_orders")
    op.drop_index(op.f("ix_installation_orders_connection_id"), table_name="installation_orders")
    op.drop_index(op.f("ix_installation_orders_client_id"), table_name="installation_orders")
    op.drop_index(op.f("ix_installation_orders_created_at"), table_name="installation_orders")
    op.drop_table("installation_orders")
