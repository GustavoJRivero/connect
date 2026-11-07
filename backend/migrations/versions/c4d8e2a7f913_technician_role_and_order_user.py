"""roles técnicos + técnico (usuario) en órdenes de instalación

Revision ID: c4d8e2a7f913
Revises: b7e3d9a4c512
Create Date: 2026-11-07

"""
import json
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = 'c4d8e2a7f913'
down_revision = 'b7e3d9a4c512'
branch_labels = None
depends_on = None


_TECH_PERMISSIONS = {
    "dashboard": ["view"],
    "clients": ["view"],
    "installations": ["view", "edit"],
}


def upgrade():
    op.add_column('roles', sa.Column('is_technician', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('installation_orders', sa.Column('technician_user_id', sa.Integer(), nullable=True))
    op.create_index('ix_installation_orders_technician_user_id', 'installation_orders', ['technician_user_id'])
    op.create_foreign_key(
        'fk_installation_orders_technician_user', 'installation_orders', 'users',
        ['technician_user_id'], ['id'],
    )

    conn = op.get_bind()
    exists = conn.execute(sa.text("SELECT id FROM roles WHERE LOWER(name) IN ('técnico', 'tecnico')")).scalar()
    if exists:
        conn.execute(sa.text("UPDATE roles SET is_technician = 1 WHERE id = :id"), {"id": exists})
    else:
        conn.execute(
            sa.text(
                "INSERT INTO roles (created_at, name, description, is_admin, is_technician, permissions) "
                "VALUES (:created_at, :name, :description, 0, 1, :permissions)"
            ),
            {
                "created_at": datetime.utcnow(),
                "name": "Técnico",
                "description": "Hace las instalaciones: ve y actualiza sus órdenes.",
                "permissions": json.dumps(_TECH_PERMISSIONS, ensure_ascii=False, sort_keys=True),
            },
        )


def downgrade():
    op.drop_constraint('fk_installation_orders_technician_user', 'installation_orders', type_='foreignkey')
    op.drop_index('ix_installation_orders_technician_user_id', table_name='installation_orders')
    op.drop_column('installation_orders', 'technician_user_id')
    op.drop_column('roles', 'is_technician')
