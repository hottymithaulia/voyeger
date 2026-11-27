from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from pipeline.build_pack import write_pack_contents
from pipeline.ingest_curated import ingest_curated
from pipeline.validate import ValidationResult, validate_content_dir
from server.config import get_settings
from server.models import PackVersion
from server.routers.health import set_cached_version
from server.services.delta_service import compute_delta_payload, save_delta


class PublishValidationError(Exception):
    def __init__(self, errors: List[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def get_current_version(db: Session) -> int:
    row = db.scalar(select(PackVersion).where(PackVersion.is_current.is_(True)))
    if row:
        return row.version
    latest = db.scalar(select(PackVersion).order_by(PackVersion.version.desc()))
    return latest.version if latest else 0


def _load_prev_snapshot(pack_dir: Path, version: int) -> tuple[list | None, list | None, dict | None]:
    vdir = pack_dir / f"v{version}"
    if not vdir.is_dir():
        return None, None, None
    places = json.loads((vdir / "places.json").read_text(encoding="utf-8")) if (vdir / "places.json").is_file() else None
    partners = json.loads((vdir / "partners.json").read_text(encoding="utf-8")) if (vdir / "partners.json").is_file() else None
    text_by_place: Dict[str, Dict[str, Dict[str, Any]]] = {}
    i18n_dir = vdir / "i18n"
    if i18n_dir.is_dir():
        for lang_file in i18n_dir.glob("*.json"):
            lang = lang_file.stem
            data = json.loads(lang_file.read_text(encoding="utf-8"))
            for pid, tdict in data.items():
                if pid.startswith("_"):
                    continue
                text_by_place.setdefault(pid, {})[lang] = tdict
    return places, partners, text_by_place


def publish_pack(
    db: Session,
    content_dir: Path | None = None,
    strict: bool = False,
    target_version: int | None = None,
) -> Dict[str, Any]:
    """Atomically validate, ingest, build pack/v{N}, generate delta, and mark current."""
    settings = get_settings()
    resolved_content_dir = content_dir if content_dir is not None else settings.content_dir
    current_v = get_current_version(db)
    next_v = target_version if target_version is not None else (current_v + 1)

    # 1. Validate curated YAML before touching DB or pack_dir
    val: ValidationResult = validate_content_dir(resolved_content_dir, strict=strict)
    if not val.ok:
        raise PublishValidationError(val.errors)

    # 2. Ingest curated content into DB
    ingest_curated(db, content_dir=resolved_content_dir, target_version=next_v)

    # 3. Compute delta if upgrading from current_v >= 1
    delta_payload = None
    if current_v >= 1 and next_v > current_v:
        prev_places, prev_partners, prev_text = _load_prev_snapshot(settings.pack_dir, current_v)
        delta_payload = compute_delta_payload(
            db,
            from_version=current_v,
            to_version=next_v,
            prev_places=prev_places,
            prev_partners=prev_partners,
            prev_text=prev_text,
        )

    # 4. Build in a temporary directory inside pack_dir
    settings.pack_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir = settings.pack_dir / f".tmp_v{next_v}_{uuid.uuid4().hex[:8]}"
    final_dir = settings.pack_dir / f"v{next_v}"
    built_at = datetime.now(timezone.utc).isoformat()

    try:
        manifest = write_pack_contents(
            db=db,
            out_dir=tmp_dir,
            version=next_v,
            built_at=built_at,
            media_source_dir=resolved_content_dir / "media",
            delta_payload=delta_payload,
        )
        # Verify manifest integrity before moving into place
        if not (tmp_dir / "manifest.json").is_file() or not (tmp_dir / "places.json").is_file():
            raise RuntimeError("Pack build incomplete: missing manifest.json or places.json")

        if final_dir.exists():
            shutil.rmtree(final_dir)
        shutil.move(str(tmp_dir), str(final_dir))
    except Exception:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
        raise

    # 5. Persist PackVersion and Delta in DB
    if delta_payload is not None and current_v >= 1:
        save_delta(db, from_version=current_v, to_version=next_v, payload=delta_payload)

    for pv in db.scalars(select(PackVersion).where(PackVersion.is_current.is_(True))).all():
        pv.is_current = False

    existing_pv = db.get(PackVersion, next_v)
    if existing_pv:
        existing_pv.built_at = built_at
        existing_pv.min_app_version = settings.app_min_version
        existing_pv.manifest = manifest
        existing_pv.is_current = True
    else:
        db.add(
            PackVersion(
                version=next_v,
                built_at=built_at,
                min_app_version=settings.app_min_version,
                manifest=manifest,
                is_current=True,
            )
        )
    db.commit()
    set_cached_version(next_v)
    return manifest
