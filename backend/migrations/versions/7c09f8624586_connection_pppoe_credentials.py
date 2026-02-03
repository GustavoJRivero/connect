"""connection pppoe credentials

Revision ID: 7c09f8624586
Revises: af61c138e705
Create Date: 2026-02-01 22:00:55.141285

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c09f8624586'
down_revision = 'af61c138e705'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(sa.Column("pppoe_username", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("pppoe_password", sa.String(length=128), nullable=True))
        batch_op.create_index(batch_op.f("ix_connections_pppoe_username"), ["pppoe_username"], unique=False)

    op.execute(
        "UPDATE connections SET pppoe_username = CAST(id AS CHAR) WHERE pppoe_username IS NULL OR pppoe_username = ''"
    )
    op.execute(
        "UPDATE connections SET pppoe_password = CAST(id AS CHAR) WHERE pppoe_password IS NULL OR pppoe_password = ''"
    )


def downgrade():
    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_connections_pppoe_username"))
        batch_op.drop_column("pppoe_password")
        batch_op.drop_column("pppoe_username")
