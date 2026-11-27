from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import yaml

from server.config import get_settings

VALID_CATEGORIES = {"hidden_gem", "food", "culture", "experience"}
VALID_STATUSES = {"draft", "ready", "hold"}
VALID_PARTNER_TYPES = {"board", "homestay", "food", "experience", "artisan", "performer", "vendor"}
VALID_ONBOARDED_VIA = {"form", "whatsapp", "admin"}

PLACEHOLDER_STRINGS = (
    "Verify locally",
    "PENDING_HUMAN_ETIQUETTE_NOTE",
    "स्थानीय स्तर पर पुष्टि करें",
    "classified",
    "hidden_gem",
    "radius",
)


@dataclass
class ValidationResult:
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    places_count: int = 0
    hold_skipped: int = 0
    partners_count: int = 0

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0


def _contains_placeholder(text: str) -> Optional[str]:
    for pat in PLACEHOLDER_STRINGS:
        if pat in text:
            return pat
    return None


def validate_place_dict(
    data: Dict[str, Any],
    bbox: Tuple[float, float, float, float],
    required_languages: List[str],
    strict: bool = False,
    source_name: str = "<memory>",
    media_dir: Optional[Path] = None,
) -> Tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []

    status = data.get("status", "draft")
    if status not in VALID_STATUSES:
        errors.append(f"{source_name}: invalid status '{status}' (expected draft|ready|hold)")
        status = "draft"

    if status == "hold":
        return [], []

    pid = data.get("id")
    if not pid or not isinstance(pid, str):
        errors.append(f"{source_name}: missing or invalid 'id'")
        pid = source_name

    slug = data.get("slug")
    if not slug or not isinstance(slug, str):
        errors.append(f"place '{pid}': missing or invalid 'slug'")

    category = data.get("category")
    if category not in VALID_CATEGORIES:
        errors.append(
            f"place '{pid}': invalid category '{category}' (expected one of {sorted(VALID_CATEGORIES)})"
        )

    is_ready = status == "ready"

    # Geo validation: null geo is warning for draft, error for ready; non-null outside bbox always errors
    geo = data.get("geo")
    if not isinstance(geo, dict) or geo.get("lat") is None or geo.get("lng") is None:
        msg = f"place '{pid}': missing geo.lat / geo.lng"
        if is_ready:
            errors.append(msg)
        else:
            warnings.append(msg)
    else:
        try:
            lat = float(geo["lat"])
            lng = float(geo["lng"])
            south, west, north, east = bbox
            if not (south <= lat <= north and west <= lng <= east):
                errors.append(
                    f"place '{pid}': coordinates ({lat}, {lng}) outside BHOPAL_BBOX ({south},{west},{north},{east})"
                )
        except (TypeError, ValueError):
            errors.append(f"place '{pid}': lat/lng must be numeric")

    # Sensitivity validation
    sensitivity = data.get("sensitivity") or {}
    is_sacred = bool(sensitivity.get("is_sacred", False))
    sacred_note = sensitivity.get("note")
    if sacred_note:
        ph = _contains_placeholder(str(sacred_note))
        if ph:
            errors.append(f"place '{pid}': placeholder string '{ph}' found in sensitivity.note")
    if is_sacred and (not sacred_note or not str(sacred_note).strip()):
        msg = f"place '{pid}': is_sacred=true requires a non-empty sacred_note"
        if is_ready:
            errors.append(msg)
        else:
            warnings.append(msg)

    # Hours warning on draft
    if not data.get("hours") or not str(data.get("hours")).strip():
        warnings.append(f"place '{pid}': missing verified 'hours'")

    if bool(data.get("is_anchor", False)):
        anchor_for = data.get("anchor_for") or []
        if not anchor_for:
            warnings.append(f"place '{pid}': is_anchor=true but 'anchor_for' is empty")

    # Media validation
    media = data.get("media") or {}
    images = media.get("images") or []
    is_placeholder_media = bool(media.get("placeholder", False))
    if not images:
        msg = f"place '{pid}': missing real photograph"
        if is_ready:
            errors.append(msg)
        else:
            warnings.append(msg)
    elif is_ready and is_placeholder_media:
        errors.append(f"place '{pid}': ready places may not use placeholder media")

    has_real_image_file = False
    for idx, img in enumerate(images):
        if not isinstance(img, dict):
            errors.append(f"place '{pid}': media.images[{idx}] must be a mapping")
            continue
        credit = img.get("credit")
        if not credit or not str(credit).strip():
            errors.append(f"place '{pid}': media.images[{idx}] missing 'credit'")
        if is_ready and (not img.get("license") or not str(img.get("license")).strip()):
            errors.append(f"place '{pid}': media.images[{idx}] missing 'license'")
        alt = img.get("alt")
        if not isinstance(alt, dict) or not any(str(v).strip() for v in alt.values()):
            errors.append(f"place '{pid}': media.images[{idx}] missing 'alt' text")
        else:
            for lang in required_languages:
                if not str(alt.get(lang, "")).strip():
                    errors.append(
                        f"place '{pid}': media.images[{idx}] missing alt text for '{lang}'"
                    )
        src_name = img.get("source_file")
        if media_dir is not None and src_name and (media_dir / str(src_name)).is_file():
            has_real_image_file = True

    if is_ready and images and media_dir is not None and not has_real_image_file:
        errors.append(f"place '{pid}': ready places require at least one real image file on disk")

    # Provenance verification check for ready
    prov = data.get("provenance") or {}
    if is_ready and (not prov.get("verified_by") or not prov.get("verified_at")):
        errors.append(f"place '{pid}': provenance.verified_by and verified_at are required for ready")

    # Text & placeholder validation
    text_map = data.get("text") or {}
    if not isinstance(text_map, dict):
        errors.append(f"place '{pid}': 'text' must be a mapping by language")
    else:
        for lang in required_languages:
            entry = text_map.get(lang)
            if not isinstance(entry, dict):
                errors.append(f"place '{pid}': missing text block for required language '{lang}'")
                continue
            for field_name in ("title", "summary", "story"):
                val = entry.get(field_name)
                if not val or not str(val).strip():
                    errors.append(f"place '{pid}': missing '{field_name}' in '{lang}'")
                else:
                    ph = _contains_placeholder(str(val))
                    if ph:
                        errors.append(
                            f"place '{pid}': placeholder string '{ph}' found in text.{lang}.{field_name}"
                        )
            tips_val = entry.get("tips")
            if tips_val is not None and not isinstance(tips_val, list):
                errors.append(f"place '{pid}': 'tips' in '{lang}' must be a list of strings")
            else:
                tips_list = tips_val or []
                for tip in tips_list:
                    ph = _contains_placeholder(str(tip))
                    if ph:
                        errors.append(
                            f"place '{pid}': placeholder string '{ph}' found in text.{lang}.tips"
                        )
                if len(tips_list) == 0:
                    msg = f"place '{pid}': empty 'tips' in '{lang}'"
                    if is_ready:
                        errors.append(msg)
                    else:
                        warnings.append(msg)

            if bool(entry.get("needs_review", False)):
                msg = f"place '{pid}': '{lang}' text has needs_review=true"
                if is_ready:
                    errors.append(msg)
                else:
                    warnings.append(msg)

    if strict and warnings:
        errors.extend(warnings)
        warnings = []

    return errors, warnings


def validate_content_dir(
    content_dir: Path = Path("content"),
    strict: bool = False,
) -> ValidationResult:
    settings = get_settings()
    result = ValidationResult()

    places_dir = content_dir / "places"
    partners_dir = content_dir / "partners"
    media_dir = content_dir / "media"

    seen_place_ids: Set[str] = set()
    seen_slugs: Set[str] = set()

    if places_dir.is_dir():
        for path in sorted(places_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            except Exception as exc:
                result.errors.append(f"{path}: failed to parse YAML: {exc}")
                continue

            if data.get("status") == "hold":
                result.hold_skipped += 1
                continue

            result.places_count += 1
            errs, warns = validate_place_dict(
                data,
                bbox=settings.bhopal_bbox,
                required_languages=settings.required_languages,
                strict=strict,
                source_name=str(path),
                media_dir=media_dir if media_dir.is_dir() else None,
            )
            result.errors.extend(errs)
            result.warnings.extend(warns)

            pid = data.get("id")
            if isinstance(pid, str) and pid:
                if pid in seen_place_ids:
                    result.errors.append(f"{path}: duplicate place id '{pid}'")
                seen_place_ids.add(pid)

            slug = data.get("slug")
            if isinstance(slug, str) and slug:
                if slug in seen_slugs:
                    result.errors.append(f"{path}: duplicate place slug '{slug}'")
                seen_slugs.add(slug)

    seen_partner_ids: Set[str] = set()
    if partners_dir.is_dir():
        for path in sorted(partners_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            except Exception as exc:
                result.errors.append(f"{path}: failed to parse YAML: {exc}")
                continue

            result.partners_count += 1
            partner_id = data.get("id")
            if not partner_id or not isinstance(partner_id, str):
                result.errors.append(f"{path}: missing partner 'id'")
                continue
            if partner_id in seen_partner_ids:
                result.errors.append(f"{path}: duplicate partner id '{partner_id}'")
            seen_partner_ids.add(partner_id)

            ptype = data.get("type")
            if ptype not in VALID_PARTNER_TYPES:
                result.errors.append(f"partner '{partner_id}': invalid type '{ptype}'")

            onboarded = data.get("onboarded_via", "admin")
            if onboarded not in VALID_ONBOARDED_VIA:
                result.errors.append(f"partner '{partner_id}': invalid onboarded_via '{onboarded}'")

            if not data.get("name"):
                result.errors.append(f"partner '{partner_id}': missing 'name'")

            for ref_pid in data.get("place_ids") or []:
                if ref_pid not in seen_place_ids:
                    result.errors.append(
                        f"partner '{partner_id}': references unknown place_id '{ref_pid}'"
                    )

    if strict and result.warnings:
        result.errors.extend(result.warnings)
        result.warnings = []

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate curated YAML content")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    parser.add_argument("--strict", action="store_true", help="Treat all warnings as errors")
    args = parser.parse_args()

    res = validate_content_dir(args.content_dir, strict=args.strict)
    for w in res.warnings:
        print(f"[WARN] {w}")
    for e in res.errors:
        print(f"[ERROR] {e}", file=sys.stderr)

    print(
        f"Validated {res.places_count} places ({res.hold_skipped} hold skipped) "
        f"and {res.partners_count} partners: "
        f"{len(res.errors)} errors, {len(res.warnings)} warnings."
    )
    if not res.ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
