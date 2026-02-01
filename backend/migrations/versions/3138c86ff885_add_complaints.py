"""add complaints

Revision ID: 3138c86ff885
Revises: 238cbd6c7dac
Create Date: 2026-01-31 22:02:11.922441

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3138c86ff885'
down_revision = '238cbd6c7dac'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    def _id():
        # SQLite autoincrement funciona correctamente con INTEGER PRIMARY KEY
        return sa.Integer() if is_sqlite else sa.BigInteger()

    with op.batch_alter_table("complaints", schema=None) as batch_op:
        # no-op: ensures batch context works if table exists (shouldn't)
        pass

    op.create_table(
        "complaints",
        sa.Column("id", _id(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("client_id", _id(), nullable=False),
        sa.Column("connection_id", _id(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("detail", sa.String(length=2000), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("solved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["connection_id"], ["connections.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_complaints_created_at"), "complaints", ["created_at"], unique=False)
    op.create_index(op.f("ix_complaints_client_id"), "complaints", ["client_id"], unique=False)
    op.create_index(op.f("ix_complaints_connection_id"), "complaints", ["connection_id"], unique=False)
    op.create_index(op.f("ix_complaints_solved_at"), "complaints", ["solved_at"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_complaints_solved_at"), table_name="complaints")
    op.drop_index(op.f("ix_complaints_connection_id"), table_name="complaints")
    op.drop_index(op.f("ix_complaints_client_id"), table_name="complaints")
    op.drop_index(op.f("ix_complaints_created_at"), table_name="complaints")
    op.drop_table("complaints")
