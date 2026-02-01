"""connection ip and fixed ip

Revision ID: 5f050d844701
Revises: 186005c89249
Create Date: 2026-02-01 03:43:32.540995

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5f050d844701'
down_revision = '186005c89249'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    def _id():
        # SQLite autoincrement funciona correctamente con INTEGER PRIMARY KEY
        return sa.Integer() if is_sqlite else sa.BigInteger()

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fixed_ip", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("last_ip", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("last_uptime", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("last_connected_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("last_disconnected_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("last_seen_at", sa.DateTime(), nullable=True))

        batch_op.create_index(batch_op.f("ix_connections_last_seen_at"), ["last_seen_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_connections_fixed_ip"), ["fixed_ip"], unique=False)


def downgrade():
    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_connections_fixed_ip"))
        batch_op.drop_index(batch_op.f("ix_connections_last_seen_at"))

        batch_op.drop_column("last_seen_at")
        batch_op.drop_column("last_disconnected_at")
        batch_op.drop_column("last_connected_at")
        batch_op.drop_column("last_uptime")
        batch_op.drop_column("last_ip")
        batch_op.drop_column("fixed_ip")
