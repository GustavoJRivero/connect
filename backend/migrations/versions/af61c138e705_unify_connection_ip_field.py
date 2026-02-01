"""unify connection ip field

Revision ID: af61c138e705
Revises: 5f050d844701
Create Date: 2026-02-01 03:55:39.728504

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'af61c138e705'
down_revision = '5f050d844701'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ip", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("ip_is_fixed", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.create_index(batch_op.f("ix_connections_ip"), ["ip"], unique=False)

    # Migra datos:
    # - si había fixed_ip -> ip y marca ip_is_fixed=1
    # - sino, usa last_ip como ip (dinámica)
    op.execute("UPDATE connections SET ip = fixed_ip, ip_is_fixed = 1 WHERE fixed_ip IS NOT NULL AND TRIM(fixed_ip) <> ''")
    op.execute("UPDATE connections SET ip = last_ip WHERE (ip IS NULL OR TRIM(ip) = '') AND last_ip IS NOT NULL AND TRIM(last_ip) <> ''")

    # Limpia columnas viejas e índices viejos
    with op.batch_alter_table("connections", schema=None) as batch_op:
        # índices creados en migración previa
        try:
            batch_op.drop_index(batch_op.f("ix_connections_fixed_ip"))
        except Exception:
            pass
        try:
            batch_op.drop_index(batch_op.f("ix_connections_last_seen_at"))
        except Exception:
            pass

        # columnas viejas
        if _has_column(bind, "connections", "fixed_ip"):
            batch_op.drop_column("fixed_ip")
        if _has_column(bind, "connections", "last_ip"):
            batch_op.drop_column("last_ip")

    # server_default solo para migración; dejamos default en el modelo
    if not is_sqlite:
        with op.batch_alter_table("connections", schema=None) as batch_op:
            batch_op.alter_column("ip_is_fixed", server_default=None)


def downgrade():
    bind = op.get_bind()

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fixed_ip", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("last_ip", sa.String(length=64), nullable=True))

    op.execute("UPDATE connections SET fixed_ip = ip WHERE ip_is_fixed = 1 AND ip IS NOT NULL AND TRIM(ip) <> ''")
    op.execute("UPDATE connections SET last_ip = ip WHERE (ip_is_fixed = 0 OR ip_is_fixed IS NULL) AND ip IS NOT NULL AND TRIM(ip) <> ''")

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_connections_ip"))
        batch_op.drop_column("ip_is_fixed")
        batch_op.drop_column("ip")

        batch_op.create_index(batch_op.f("ix_connections_fixed_ip"), ["fixed_ip"], unique=False)
        batch_op.create_index(batch_op.f("ix_connections_last_seen_at"), ["last_seen_at"], unique=False)


def _has_column(bind, table_name: str, col: str) -> bool:
    insp = sa.inspect(bind)
    cols = [c["name"] for c in insp.get_columns(table_name)]
    return col in cols
