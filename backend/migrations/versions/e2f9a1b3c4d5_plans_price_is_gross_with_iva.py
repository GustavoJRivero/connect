"""plans.price = precio final (IVA incl.); migrar netos existentes

Revision ID: e2f9a1b3c4d5
Revises: c3f7d2e89a01
Create Date: 2026-05-05

Antes `plans.price` era neto (sin IVA). Ahora guarda el monto final que paga el cliente.
Esta migración convierte datos viejos: price_nuevo = price * (1 + iva_percent/100).
"""
from alembic import op
from sqlalchemy import text


revision = "e2f9a1b3c4d5"
down_revision = "c3f7d2e89a01"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE plans
            SET price = ROUND(CAST(price AS DECIMAL(14, 4)) * (1 + CAST(iva_percent AS DECIMAL(10, 4)) / 100), 2)
            """
        )
    )


def downgrade():
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE plans
            SET price = ROUND(CAST(price AS DECIMAL(14, 4)) / (1 + CAST(iva_percent AS DECIMAL(10, 4)) / 100), 2)
            """
        )
    )
