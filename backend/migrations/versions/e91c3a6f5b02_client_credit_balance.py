"""client credit balance

Revision ID: e91c3a6f5b02
Revises: b3c7d1e9f204
Create Date: 2026-09-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e91c3a6f5b02'
down_revision = 'd4f6b8a1e937'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.add_column(sa.Column('credit_balance', sa.Numeric(12, 2), nullable=False, server_default='0'))

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
    op.drop_table('client_credit_movements')
    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.drop_column('credit_balance')
