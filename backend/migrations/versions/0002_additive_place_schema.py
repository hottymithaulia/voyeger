"""add place status, theme, and nullable geo

Revision ID: 0002_additive_place_schema
Revises: 0001_initial
Create Date: 2026-11-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_additive_place_schema"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("places") as batch_op:
        batch_op.alter_column("lat", existing_type=sa.Float(), nullable=True)
        batch_op.alter_column("lng", existing_type=sa.Float(), nullable=True)
        batch_op.add_column(
            sa.Column("status", sa.String(16), nullable=False, server_default="draft")
        )
        batch_op.add_column(sa.Column("theme", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("places") as batch_op:
        batch_op.drop_column("theme")
        batch_op.drop_column("status")
        batch_op.alter_column("lng", existing_type=sa.Float(), nullable=False)
        batch_op.alter_column("lat", existing_type=sa.Float(), nullable=False)
