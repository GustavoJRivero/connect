"""Mover pon_sn de clients a connections.

- Crea `connections.pon_sn` (nullable, varchar 64).
- Copia el valor de `clients.pon_sn` a la conexión más antigua de cada cliente
  (mejor preservar algo de data si ya estaba cargado).
- Drop `clients.pon_sn`.

Revision ID: d6e7f8901234
Revises: c5d6e7f89012
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "d6e7f8901234"
down_revision = "c5d6e7f89012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "connections",
        sa.Column("pon_sn", sa.String(length=64), nullable=True),
    )
    conn = op.get_bind()
    # Copiar el pon_sn del cliente a su conexión más antigua (id mínimo).
    conn.execute(
        text(
            """
            UPDATE connections c
            JOIN (
                SELECT MIN(id) AS conn_id, client_id
                FROM connections
                GROUP BY client_id
            ) first_c ON first_c.conn_id = c.id
            JOIN clients cl ON cl.id = first_c.client_id
            SET c.pon_sn = cl.pon_sn
            WHERE cl.pon_sn IS NOT NULL AND cl.pon_sn <> ''
            """
        )
    )
    op.drop_column("clients", "pon_sn")


def downgrade():
    op.add_column(
        "clients",
        sa.Column("pon_sn", sa.String(length=64), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE clients cl
            JOIN (
                SELECT MIN(id) AS conn_id, client_id
                FROM connections
                GROUP BY client_id
            ) first_c ON first_c.client_id = cl.id
            JOIN connections c ON c.id = first_c.conn_id
            SET cl.pon_sn = c.pon_sn
            WHERE c.pon_sn IS NOT NULL AND c.pon_sn <> ''
            """
        )
    )
    op.drop_column("connections", "pon_sn")
