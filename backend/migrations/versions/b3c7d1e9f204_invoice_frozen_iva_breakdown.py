"""invoice frozen iva breakdown

Revision ID: b3c7d1e9f204
Revises: f8a9b0c12345
Create Date: 2026-09-16

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3c7d1e9f204'
down_revision = 'f8a9b0c12345'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('iva_percent', sa.Numeric(5, 2), nullable=True))
        batch_op.add_column(sa.Column('net_amount', sa.Numeric(12, 2), nullable=True))
        batch_op.add_column(sa.Column('iva_amount', sa.Numeric(12, 2), nullable=True))


def downgrade():
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_column('iva_amount')
        batch_op.drop_column('net_amount')
        batch_op.drop_column('iva_percent')
