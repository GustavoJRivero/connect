"""add system_logs

Revision ID: e3a5f7c21b89
Revises: d7f3b2a19c45
Create Date: 2026-02-09 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3a5f7c21b89'
down_revision = 'd7f3b2a19c45'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'system_logs',
        sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('module', sa.String(length=32), nullable=False),
        sa.Column('action', sa.String(length=64), nullable=False),
        sa.Column('level', sa.String(length=10), nullable=False, server_default='INFO'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ref_id', sa.BigInteger(), nullable=True),
        sa.Column('ref_type', sa.String(length=32), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_system_logs_created_at', 'system_logs', ['created_at'])
    op.create_index('ix_system_logs_module', 'system_logs', ['module'])
    op.create_index('ix_system_logs_action', 'system_logs', ['action'])
    op.create_index('ix_system_logs_ref_id', 'system_logs', ['ref_id'])


def downgrade():
    op.drop_index('ix_system_logs_ref_id', table_name='system_logs')
    op.drop_index('ix_system_logs_action', table_name='system_logs')
    op.drop_index('ix_system_logs_module', table_name='system_logs')
    op.drop_index('ix_system_logs_created_at', table_name='system_logs')
    op.drop_table('system_logs')
