"""client status retired

Revision ID: c8dc9fa38294
Revises: 7c09f8624586
Create Date: 2026-02-01 22:25:26.471878

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8dc9fa38294'
down_revision = '7c09f8624586'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("clients", schema=None) as batch_op:
        batch_op.add_column(sa.Column("status", sa.String(length=32), nullable=False, server_default="ACTIVE"))
        batch_op.create_index(batch_op.f("ix_clients_status"), ["status"], unique=False)

    op.execute("UPDATE clients SET status='RETIRED', is_active=0 WHERE is_active=0")
    op.execute(
        """
        UPDATE clients
        SET status='RETIRED', is_active=0
        WHERE id NOT IN (SELECT DISTINCT client_id FROM connections)
        """
    )

    with op.batch_alter_table("clients", schema=None) as batch_op:
        batch_op.alter_column("status", server_default=None)


def downgrade():
    with op.batch_alter_table("clients", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_clients_status"))
        batch_op.drop_column("status")
