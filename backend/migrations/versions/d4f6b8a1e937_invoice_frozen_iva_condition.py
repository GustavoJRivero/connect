"""invoice frozen iva condition

Revision ID: d4f6b8a1e937
Revises: c7e2a5f9d813
Create Date: 2026-09-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4f6b8a1e937'
down_revision = 'c7e2a5f9d813'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('iva_condition', sa.SmallInteger(), nullable=True))


def downgrade():
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_column('iva_condition')
