"""ACL por roles, email + código de login y auditoría de acciones de usuario.

Revision ID: a9c1e2f3b4d5
Revises: f8a9b0c12345
Create Date: 2026-09-22
"""
import json
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "a9c1e2f3b4d5"
down_revision = "f8a9b0c12345"
branch_labels = None
depends_on = None


_VIEW_ALL = ["dashboard", "clients", "installations", "billing", "invoices", "payments", "network", "plans", "jobs"]

_DEFAULT_ROLES = [
    {
        "name": "Administrador",
        "description": "Acceso total, incluida la gestión de usuarios y roles.",
        "is_admin": True,
        "permissions": {},
    },
    {
        "name": "Operador",
        "description": "Opera clientes, instalaciones, facturas y pagos. Sin configuración ni usuarios.",
        "is_admin": False,
        "permissions": {
            "dashboard": ["view"],
            "clients": ["view", "edit"],
            "installations": ["view", "edit"],
            "billing": ["view"],
            "invoices": ["view", "edit"],
            "payments": ["view", "edit"],
            "network": ["view"],
            "plans": ["view"],
            "jobs": ["view"],
        },
    },
    {
        "name": "Solo lectura",
        "description": "Consulta todas las secciones operativas sin modificar nada.",
        "is_admin": False,
        "permissions": {m: ["view"] for m in _VIEW_ALL},
    },
]


def upgrade():
    roles = op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("permissions", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    now = datetime.utcnow()
    op.bulk_insert(
        roles,
        [
            {
                "created_at": now,
                "name": r["name"],
                "description": r["description"],
                "is_admin": r["is_admin"],
                "permissions": json.dumps(r["permissions"], sort_keys=True),
            }
            for r in _DEFAULT_ROLES
        ],
    )

    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("email", sa.String(length=190), nullable=True))
        batch.add_column(sa.Column("role_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("last_login_at", sa.DateTime(), nullable=True))
        batch.create_index("ix_users_email", ["email"], unique=True)
        batch.create_index("ix_users_role_id", ["role_id"])
        batch.create_foreign_key("fk_users_role_id", "roles", ["role_id"], ["id"])

    conn = op.get_bind()
    admin_id = conn.execute(sa.text("SELECT id FROM roles WHERE name = 'Administrador'")).scalar()
    operator_id = conn.execute(sa.text("SELECT id FROM roles WHERE name = 'Operador'")).scalar()
    conn.execute(sa.text("UPDATE users SET role_id = :rid WHERE role = 'OPERATOR'"), {"rid": operator_id})
    conn.execute(sa.text("UPDATE users SET role_id = :rid WHERE role_id IS NULL"), {"rid": admin_id})

    op.create_table(
        "login_challenges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_login_challenges_user_id", "login_challenges", ["user_id"])

    op.create_table(
        "user_activity_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=190), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("module", sa.String(length=32), nullable=True),
        sa.Column("summary", sa.String(length=255), nullable=False),
        sa.Column("method", sa.String(length=8), nullable=True),
        sa.Column("path", sa.String(length=255), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("ref_id", sa.BigInteger(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_activity_logs_created_at", "user_activity_logs", ["created_at"])
    op.create_index("ix_user_activity_logs_user_id", "user_activity_logs", ["user_id"])
    op.create_index("ix_user_activity_logs_action", "user_activity_logs", ["action"])
    op.create_index("ix_user_activity_logs_module", "user_activity_logs", ["module"])


def downgrade():
    op.drop_table("user_activity_logs")
    op.drop_table("login_challenges")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_users_role_id", type_="foreignkey")
        batch.drop_index("ix_users_role_id")
        batch.drop_index("ix_users_email")
        batch.drop_column("last_login_at")
        batch.drop_column("role_id")
        batch.drop_column("email")
    op.drop_table("roles")
