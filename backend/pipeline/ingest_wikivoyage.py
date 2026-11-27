from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Dict

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from server.config import get_settings
from server.db import SessionLocal
from server.models import EnrichmentCache, Place, PlaceText
from server.services.enrichment_service import fetch_wikivoyage_enrichment


async def ingest_wikivoyage_all(db: Session, rate_delay_seconds: float = 0.5) -> Dict[str, int]:
    settings = get_settings()
    places = list(db.scalars(select(Place).where(Place.deleted.is_(False))).all())
    updated = 0
    failed = 0

    async with httpx.AsyncClient(timeout=10.0) as client:
        for idx, place in enumerate(places):
            if idx > 0 and rate_delay_seconds > 0:
                await asyncio.sleep(rate_delay_seconds)
            en_text = db.get(PlaceText, (place.id, "en"))
            title = en_text.title if en_text else place.slug

            payload = None
            for attempt in range(2):
                try:
                    payload = await fetch_wikivoyage_enrichment(client, title)
                    break
                except Exception:
                    if attempt == 0:
                        await asyncio.sleep(0.5)
                    else:
                        failed += 1

            if payload is not None:
                now = datetime.now(timezone.utc)
                row = db.get(EnrichmentCache, (place.id, "wikivoyage"))
                if row is None:
                    db.add(
                        EnrichmentCache(
                            place_id=place.id,
                            source="wikivoyage",
                            payload=payload,
                            fetched_at=now,
                            ttl_hours=settings.enrichment_ttl_hours,
                        )
                    )
                else:
                    row.payload = payload
                    row.fetched_at = now
                    row.ttl_hours = settings.enrichment_ttl_hours
                updated += 1

    db.commit()
    return {"updated": updated, "failed": failed}


def main() -> None:
    with SessionLocal() as db:
        res = asyncio.run(ingest_wikivoyage_all(db, rate_delay_seconds=0.5))
    print(f"Wikivoyage enrichment complete: {res['updated']} updated, {res['failed']} failed.")


if __name__ == "__main__":
    main()
