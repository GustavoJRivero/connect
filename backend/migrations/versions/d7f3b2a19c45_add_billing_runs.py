"""add billing runs

Revision ID: d7f3b2a19c45
Revises: b4e2a1c93d10
Create Date: 2026-02-09 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd7f3b2a19c45'
down_revision = 'b4e2a1c93d10'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "billing_runs",
        sa.Column("id", sa.BigInteger(), nullable=False, autoincrement=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("billing_date", sa.Date(), nullable=False),
        sa.Column("trigger", sa.String(length=32), nullable=False, server_default="SCHEDULER"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="RUNNING"),
        sa.Column("connections_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invoices_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invoices_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors_detail", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("billing_runs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_billing_runs_billing_date"), ["billing_date"], unique=False)


def downgrade():
    op.drop_table("billing_runs")
