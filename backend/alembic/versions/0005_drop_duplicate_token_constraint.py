"""Drop the duplicate unique constraint on invitations.token_hash.

Migration 0003 created both a unique constraint and a unique index on the column.
The unique index (ix_invitations_token_hash) alone matches the model, so
`alembic check` reports no drift and the column is indexed once.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-09
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("invitations_token_hash_key", "invitations", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("invitations_token_hash_key", "invitations", ["token_hash"])
