"""invoice description and notes

Revision ID: c3f7d2e89a01
Revises: b4e2a1c93d10
Create Date: 2026-02-16 20:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3f7d2e89a01'
down_revision = 'b2c1e8a3f4d5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column("description", sa.String(500), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.drop_column("notes")
        batch_op.drop_column("description")
