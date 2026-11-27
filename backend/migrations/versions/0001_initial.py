"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("slug", sa.String(128), nullable=False, unique=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("is_anchor", sa.Boolean(), nullable=False),
        sa.Column("anchor_for", sa.JSON(), nullable=False),
        sa.Column("hours", sa.String(256), nullable=True),
        sa.Column("best_time", sa.String(256), nullable=True),
        sa.Column("cost_note", sa.String(512), nullable=True),
        sa.Column("is_sacred", sa.Boolean(), nullable=False),
        sa.Column("sacred_note", sa.Text(), nullable=True),
        sa.Column("partner_id", sa.String(128), nullable=True),
        sa.Column("media", sa.JSON(), nullable=False),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("enrichment", sa.JSON(), nullable=False),
        sa.Column("updated_in_version", sa.Integer(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_places_slug", "places", ["slug"], unique=True)

    op.create_table(
        "place_text",
        sa.Column("place_id", sa.String(128), sa.ForeignKey("places.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("lang", sa.String(16), primary_key=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("story", sa.Text(), nullable=False),
        sa.Column("tips", sa.Text(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "partners",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("contact", sa.JSON(), nullable=False),
        sa.Column("place_ids", sa.JSON(), nullable=False),
        sa.Column("offer", sa.Text(), nullable=True),
        sa.Column("featured_until", sa.String(64), nullable=True),
        sa.Column("onboarded_via", sa.String(32), nullable=False),
        sa.Column("updated_in_version", sa.Integer(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "partner_text",
        sa.Column("partner_id", sa.String(128), sa.ForeignKey("partners.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("lang", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("offer", sa.Text(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "pack_versions",
        sa.Column("version", sa.Integer(), primary_key=True),
        sa.Column("built_at", sa.String(64), nullable=False),
        sa.Column("min_app_version", sa.String(32), nullable=False),
        sa.Column("manifest", sa.JSON(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "deltas",
        sa.Column("from_version", sa.Integer(), primary_key=True),
        sa.Column("to_version", sa.Integer(), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("place_id", sa.String(128), nullable=True),
        sa.Column("partner_id", sa.String(128), nullable=True),
        sa.Column("ts", sa.String(64), nullable=False),
        sa.Column("session_id", sa.String(128), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_events_place_id", "events", ["place_id"])
    op.create_index("ix_events_partner_id", "events", ["partner_id"])

    op.create_table(
        "enquiries",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("partner_id", sa.String(128), nullable=True),
        sa.Column("place_id", sa.String(128), nullable=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("contact", sa.String(256), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("lang", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
    )
    op.create_index("ix_enquiries_partner_id", "enquiries", ["partner_id"])

    op.create_table(
        "applications",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("applicant_type", sa.String(32), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("contact", sa.String(256), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
    )

    op.create_table(
        "enrichment_cache",
        sa.Column("place_id", sa.String(128), primary_key=True),
        sa.Column("source", sa.String(32), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ttl_hours", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("enrichment_cache")
    op.drop_table("applications")
    op.drop_index("ix_enquiries_partner_id", table_name="enquiries")
    op.drop_table("enquiries")
    op.drop_index("ix_events_partner_id", table_name="events")
    op.drop_index("ix_events_place_id", table_name="events")
    op.drop_table("events")
    op.drop_table("deltas")
    op.drop_table("pack_versions")
    op.drop_table("partner_text")
    op.drop_table("partners")
    op.drop_table("place_text")
    op.drop_index("ix_places_slug", table_name="places")
    op.drop_table("places")
