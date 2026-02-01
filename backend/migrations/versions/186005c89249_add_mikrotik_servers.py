"""add mikrotik servers

Revision ID: 186005c89249
Revises: 0376df75633d
Create Date: 2026-02-01 03:22:53.250139

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '186005c89249'
down_revision = '0376df75633d'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    def _id():
        # SQLite autoincrement funciona correctamente con INTEGER PRIMARY KEY
        return sa.Integer() if is_sqlite else sa.BigInteger()

    op.create_table(
        "mikrotik_servers",
        sa.Column("id", _id(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("host", sa.String(length=255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=128), nullable=False),
        sa.Column("password", sa.String(length=255), nullable=False),
        sa.Column("use_ssl", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_mikrotik_servers_name"),
    )
    op.create_index(op.f("ix_mikrotik_servers_name"), "mikrotik_servers", ["name"], unique=False)

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(sa.Column("server_id", _id(), nullable=True))
        batch_op.create_index(batch_op.f("ix_connections_server_id"), ["server_id"], unique=False)
        batch_op.create_foreign_key(
            batch_op.f("fk_connections_server_id_mikrotik_servers"),
            "mikrotik_servers",
            ["server_id"],
            ["id"],
        )

    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.add_column(sa.Column("server_id", _id(), nullable=True))
        batch_op.create_index(batch_op.f("ix_jobs_server_id"), ["server_id"], unique=False)
        batch_op.create_foreign_key(
            batch_op.f("fk_jobs_server_id_mikrotik_servers"),
            "mikrotik_servers",
            ["server_id"],
            ["id"],
        )


def downgrade():
    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_jobs_server_id_mikrotik_servers"), type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_jobs_server_id"))
        batch_op.drop_column("server_id")

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_connections_server_id_mikrotik_servers"), type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_connections_server_id"))
        batch_op.drop_column("server_id")

    op.drop_index(op.f("ix_mikrotik_servers_name"), table_name="mikrotik_servers")
    op.drop_table("mikrotik_servers")
