# Author: Cascade (OpenAI GPT-4.1)
# Date: 2025-10-24T02:39:00Z
# PURPOSE: Add reasoning_effort column to plans table to align database schema with
#          backend model expectations for response chaining and pipeline configuration.
# SRP and DRY check: Pass — this migration only modifies the plans table schema without
#          duplicating existing logic.

"""Add reasoning_effort column to plans table

Revision ID: 003
Revises: 002
Create Date: 2025-10-24 02:39:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add reasoning_effort column with default value."""
    op.add_column(
        "plans",
        sa.Column("reasoning_effort", sa.String(length=50), nullable=False, server_default="medium"),
    )
    # Ensure existing rows have the default before dropping server default to match model expectation
    op.execute("UPDATE plans SET reasoning_effort = 'medium' WHERE reasoning_effort IS NULL")
    op.alter_column("plans", "reasoning_effort", server_default=None)


def downgrade() -> None:
    """Remove reasoning_effort column."""
    op.drop_column("plans", "reasoning_effort")
