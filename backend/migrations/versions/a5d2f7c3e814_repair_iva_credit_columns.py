"""repair iva/credit columns

Revision ID: a5d2f7c3e814
Revises: e91c3a6f5b02
Create Date: 2026-10-20

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a5d2f7c3e814'
down_revision = 'e91c3a6f5b02'
branch_labels = None
depends_on = None


# Hay bases con alembic_version en head pero sin las columnas de
# b3c7d1e9f204 / c7e2a5f9d813 / d4f6b8a1e937 / e91c3a6f5b02. Se agregan sólo si faltan.
def upgrade():
    insp = sa.inspect(op.get_bind())
    tables = set(insp.get_table_names())

    def missing(table, column):
        return column not in {c["name"] for c in insp.get_columns(table)}

    invoice_cols = [
        sa.Column('iva_percent', sa.Numeric(5, 2), nullable=True),
        sa.Column('net_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('iva_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('iva_condition', sa.SmallInteger(), nullable=True),
    ]
    for col in invoice_cols:
        if missing('invoices', col.name):
            op.add_column('invoices', col)

    if missing('clients', 'iva_condition'):
        op.add_column('clients', sa.Column('iva_condition', sa.SmallInteger(), nullable=False, server_default='5'))
        op.execute("UPDATE clients SET iva_condition = 1 WHERE kind = 'COMPANY'")

    if missing('clients', 'credit_balance'):
        op.add_column('clients', sa.Column('credit_balance', sa.Numeric(12, 2), nullable=False, server_default='0'))

    if 'client_credit_movements' not in tables:
        op.create_table(
            'client_credit_movements',
            sa.Column('id', sa.BigInteger(), primary_key=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('client_id', sa.BigInteger(), sa.ForeignKey('clients.id'), nullable=False, index=True),
            sa.Column('amount', sa.Numeric(12, 2), nullable=False),
            sa.Column('reason', sa.String(32), nullable=False),
            sa.Column('payment_id', sa.BigInteger(), sa.ForeignKey('payments.id'), nullable=True, index=True),
            sa.Column('invoice_id', sa.BigInteger(), sa.ForeignKey('invoices.id'), nullable=True, index=True),
        )


def downgrade():
    pass
