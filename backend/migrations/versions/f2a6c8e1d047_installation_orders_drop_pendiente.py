"""installation orders: PENDIENTE -> SIN_COBERTURA

Revision ID: f2a6c8e1d047
Revises: a5d2f7c3e814
Create Date: 2026-11-07

"""
from alembic import op


revision = 'f2a6c8e1d047'
down_revision = 'a5d2f7c3e814'
branch_labels = None
depends_on = None


# El estado PENDIENTE dejó de existir: si el mapa no responde la solicitud no se
# guarda. Las que habían quedado así se pueden reverificar desde "Sin cobertura".
def upgrade():
    op.execute("UPDATE installation_orders SET status = 'SIN_COBERTURA' WHERE status = 'PENDIENTE'")


def downgrade():
    pass
