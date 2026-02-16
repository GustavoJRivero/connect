"""add plans table

Revision ID: f1b8c4d56a23
Revises: e3a5f7c21b89
Create Date: 2026-02-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f1b8c4d56a23'
down_revision = 'e3a5f7c21b89'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'plans',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('profile', sa.String(length=64), nullable=False),
        sa.Column('download_mbps', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('upload_mbps', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('price', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('iva_percent', sa.Numeric(precision=5, scale=2), nullable=False, server_default='21'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_plans_profile', 'plans', ['profile'], unique=True)

    # Agregar plan_id FK a connections (nullable por ahora, se llena después)
    with op.batch_alter_table('connections', schema=None) as batch_op:
        batch_op.add_column(sa.Column('plan_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_connections_plan_id', 'plans', ['plan_id'], ['id'])


def downgrade():
    with op.batch_alter_table('connections', schema=None) as batch_op:
        batch_op.drop_constraint('fk_connections_plan_id', type_='foreignkey')
        batch_op.drop_column('plan_id')

    op.drop_index('ix_plans_profile', table_name='plans')
    op.drop_table('plans')
