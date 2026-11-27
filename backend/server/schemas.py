import json
import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def strip_control_chars(value: str) -> str:
    return _CONTROL_CHAR_RE.sub("", value).strip()


def parse_tips(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        if s.startswith("["):
            try:
                loaded = json.loads(s)
                if isinstance(loaded, list):
                    return [str(x).strip() for x in loaded if str(x).strip()]
            except Exception:
                pass
        return [line.strip() for line in s.splitlines() if line.strip()]
    return [str(raw).strip()]


class ErrorResponse(BaseModel):
    error: str
    detail: str


class PlaceGeo(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


class PlaceTheme(BaseModel):
    primary: str
    secondary: str
    on_primary: str


class PlaceSensitivity(BaseModel):
    is_sacred: bool = False
    note: Optional[str] = None


class PlaceOut(BaseModel):
    id: str
    slug: str
    category: Literal["hidden_gem", "food", "culture", "experience"]
    status: Literal["draft", "ready", "hold"] = "draft"
    tags: List[str] = Field(default_factory=list)
    geo: PlaceGeo
    is_anchor: bool = False
    anchor_for: List[str] = Field(default_factory=list)
    theme: Optional[PlaceTheme] = None
    media: Dict[str, Any] = Field(default_factory=dict)
    hours: Optional[str] = None
    best_time: Optional[str] = None
    cost_note: Optional[str] = None
    sensitivity: PlaceSensitivity
    partner_id: Optional[str] = None
    enrichment: Dict[str, Any] = Field(default_factory=dict)
    provenance: Dict[str, Any] = Field(default_factory=dict)
    updated_in_version: int
    deleted: bool = False


class PartnerOut(BaseModel):
    id: str
    type: Literal["board", "homestay", "food", "experience", "artisan", "performer", "vendor"]
    name: str
    contact: Dict[str, Any] = Field(default_factory=dict)
    place_ids: List[str] = Field(default_factory=list)
    offer: Optional[str] = None
    featured_until: Optional[str] = None
    onboarded_via: Literal["form", "whatsapp", "admin"] = "admin"
    updated_in_version: int
    deleted: bool = False


class ManifestFile(BaseModel):
    path: str
    bytes: int
    sha256: str


class ManifestOut(BaseModel):
    version: int
    built_at: str
    min_app_version: str
    files: List[ManifestFile]
    languages: List[str]
    total_bytes: int


class DeltaOut(BaseModel):
    from_version: int = Field(alias="from")
    to_version: int = Field(alias="to")
    places: List[PlaceOut]
    partners: List[PartnerOut]
    text: Dict[str, Dict[str, Dict[str, Optional[str]]]]
    deleted_ids: List[str]

    model_config = {"populate_by_name": True}


class EventItem(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    type: Literal["view", "save", "directions", "enquiry", "nudge_click"]
    place_id: Optional[str] = Field(default=None, max_length=128)
    partner_id: Optional[str] = Field(default=None, max_length=128)
    ts: str = Field(min_length=1, max_length=64)
    session_id: str = Field(min_length=1, max_length=128)

    @field_validator("id", "ts", "session_id", "place_id", "partner_id")
    @classmethod
    def clean_str(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return strip_control_chars(v)


class EventsRequest(BaseModel):
    events: List[EventItem] = Field(max_length=50)


class EventsResponse(BaseModel):
    accepted: int
    duplicates: int


class PartnerApplyRequest(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=256)
    type: Literal["board", "homestay", "food", "experience", "artisan", "performer", "vendor"]
    contact: str = Field(min_length=1, max_length=256)
    offer: str = Field(default="", max_length=1000)
    place_ids: List[str] = Field(default_factory=list)
    created_at: Optional[str] = Field(default=None, max_length=64)

    @field_validator("id", "name", "contact", "offer")
    @classmethod
    def clean_str(cls, v: str) -> str:
        return strip_control_chars(v)

    @field_validator("id", "name", "contact")
    @classmethod
    def non_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("Field cannot be empty")
        return v


class EnquiryRequest(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    partner_id: Optional[str] = Field(default=None, max_length=128)
    place_id: Optional[str] = Field(default=None, max_length=128)
    name: str = Field(min_length=1, max_length=256)
    contact: str = Field(min_length=1, max_length=256)
    message: str = Field(min_length=1, max_length=4000)
    lang: str = Field(default="en", min_length=2, max_length=16)

    @field_validator("id", "name", "contact", "message", "lang", "partner_id", "place_id")
    @classmethod
    def clean_str(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = strip_control_chars(v)
        return cleaned


class ReceiptResponse(BaseModel):
    id: str
    status: str = "received"
