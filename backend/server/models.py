from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from server.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Place(Base):
    __tablename__ = "places"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    tags: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_anchor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    anchor_for: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    theme: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True, default=None)
    hours: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    best_time: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    cost_note: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_sacred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sacred_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    partner_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    media: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    provenance: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    enrichment: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    updated_in_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    texts: Mapped[List["PlaceText"]] = relationship(
        "PlaceText", back_populates="place", cascade="all, delete-orphan"
    )


class PlaceText(Base):
    __tablename__ = "place_text"

    place_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    lang: Mapped[str] = mapped_column(String(16), primary_key=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    story: Mapped[str] = mapped_column(Text, nullable=False)
    tips: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    place: Mapped["Place"] = relationship("Place", back_populates="texts")


class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    contact: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    place_ids: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    offer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    featured_until: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    onboarded_via: Mapped[str] = mapped_column(String(32), nullable=False, default="admin")
    updated_in_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    texts: Mapped[List["PartnerText"]] = relationship(
        "PartnerText", back_populates="partner", cascade="all, delete-orphan"
    )


class PartnerText(Base):
    __tablename__ = "partner_text"

    partner_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("partners.id", ondelete="CASCADE"), primary_key=True
    )
    lang: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    offer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    partner: Mapped["Partner"] = relationship("Partner", back_populates="texts")


class PackVersion(Base):
    __tablename__ = "pack_versions"

    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    built_at: Mapped[str] = mapped_column(String(64), nullable=False)
    min_app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    manifest: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Delta(Base):
    __tablename__ = "deltas"

    from_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    to_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    place_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    partner_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    ts: Mapped[str] = mapped_column(String(64), nullable=False)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class Enquiry(Base):
    __tablename__ = "enquiries"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    partner_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    place_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    contact: Mapped[str] = mapped_column(String(256), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    lang: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="received")


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    applicant_type: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    contact: Mapped[str] = mapped_column(String(256), nullable=False)
    details: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="received")


class EnrichmentCache(Base):
    __tablename__ = "enrichment_cache"

    place_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    source: Mapped[str] = mapped_column(String(32), primary_key=True)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    ttl_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=168)
