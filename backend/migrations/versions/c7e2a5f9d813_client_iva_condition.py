"""client iva condition

Revision ID: c7e2a5f9d813
Revises: b3c7d1e9f204
Create Date: 2026-09-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7e2a5f9d813'
down_revision = 'b3c7d1e9f204'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.add_column(sa.Column('iva_condition', sa.SmallInteger(), nullable=False, server_default='5'))

    # Backfill: hoy sólo las empresas pueden tener CUIT, y se asume
    # Responsable Inscripto (1). Las personas quedan en Consumidor Final (5),
    # que ya es el default de la columna. Connect debe revisar estos valores
    # caso por caso; es sólo un punto de partida, no una determinación fiscal.
    op.execute("UPDATE clients SET iva_condition = 1 WHERE kind = 'COMPANY'")


def downgrade():
    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.drop_column('iva_condition')
