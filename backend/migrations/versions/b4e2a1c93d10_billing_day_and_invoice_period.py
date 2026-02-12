"""billing day and invoice period

Revision ID: b4e2a1c93d10
Revises: c8dc9fa38294
Create Date: 2026-02-09 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b4e2a1c93d10'
down_revision = 'c8dc9fa38294'
branch_labels = None
depends_on = None


def upgrade():
    # Connection: billing_day y prorate_first_month
    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(sa.Column("billing_day", sa.Integer(), nullable=False, server_default="1"))
        batch_op.add_column(sa.Column("prorate_first_month", sa.Boolean(), nullable=False, server_default="1"))

    # Quitar server_default después de aplicar (solo era para las filas existentes)
    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.alter_column("billing_day", server_default=None)
        batch_op.alter_column("prorate_first_month", server_default=None)

    # Invoice: period_start y period_end
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column("period_start", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("period_end", sa.Date(), nullable=True))


def downgrade():
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.drop_column("period_end")
        batch_op.drop_column("period_start")

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.drop_column("prorate_first_month")
        batch_op.drop_column("billing_day")
