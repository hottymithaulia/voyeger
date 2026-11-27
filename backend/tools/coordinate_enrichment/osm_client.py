"""
OpenStreetMap API client supporting Nominatim and Overpass lookups,
along with authoritative open geographic sources (Wikidata, Wikipedia)
with rate limiting, retries, and polite user-agent identification.
"""

from __future__ import annotations

import datetime
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from tools.coordinate_enrichment.config import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_RATE_LIMIT_DELAY,
    DEFAULT_REQUEST_TIMEOUT,
    NOMINATIM_SEARCH_URL,
    OVERPASS_URL,
)
from tools.coordinate_enrichment.models import OSMCandidate

logger = logging.getLogger("voyeger.coordinate_enrichment")


class OSMClient:
    """Client for OpenStreetMap Nominatim, Overpass, and open geographic sources."""

    def __init__(
        self,
        user_agent: str,
        bbox: Tuple[float, float, float, float],
        rate_delay_seconds: float = DEFAULT_RATE_LIMIT_DELAY,
        timeout: float = DEFAULT_REQUEST_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        http_client: Optional[httpx.Client] = None,
    ):
        self.user_agent = user_agent
        self.bbox = bbox
        self.rate_delay_seconds = rate_delay_seconds
        self.timeout = timeout
        self.max_retries = max_retries
        self._last_request_time: float = 0.0
        self._custom_client = http_client
        self._internal_client: Optional[httpx.Client] = None

    def _get_client(self) -> httpx.Client:
        if self._custom_client is not None:
            return self._custom_client
        if self._internal_client is None or self._internal_client.is_closed:
            self._internal_client = httpx.Client(
                timeout=self.timeout,
                headers={"User-Agent": self.user_agent},
            )
        return self._internal_client

    def close(self) -> None:
        if self._internal_client and not self._internal_client.is_closed:
            self._internal_client.close()

    def __enter__(self) -> OSMClient:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def _respect_rate_limit(self) -> None:
        """Ensure polite interval between calls (min 1 sec for Nominatim)."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.rate_delay_seconds:
            time.sleep(self.rate_delay_seconds - elapsed)
        self._last_request_time = time.time()

    def query_nominatim(
        self,
        query: str,
        bounded: bool = False,
        limit: int = 5,
    ) -> List[OSMCandidate]:
        """
        Query OSM Nominatim API with viewbox biased to Bhopal.
        """
        south, west, north, east = self.bbox
        params: Dict[str, Any] = {
            "q": query,
            "format": "jsonv2",
            "addressdetails": "1",
            "extratags": "1",
            "limit": str(limit),
            "viewbox": f"{west},{north},{east},{south}",
            "bounded": "1" if bounded else "0",
        }

        client = self._get_client()
        candidates: List[OSMCandidate] = []

        for attempt in range(self.max_retries):
            self._respect_rate_limit()
            try:
                resp = client.get(
                    NOMINATIM_SEARCH_URL,
                    params=params,
                    headers={"User-Agent": self.user_agent},
                )
                if resp.status_code == 429:
                    wait = 2.0 * (attempt + 1)
                    logger.warning("Nominatim rate limited (429). Backing off for %.1fs...", wait)
                    time.sleep(wait)
                    continue

                resp.raise_for_status()
                data = resp.json()
                if not isinstance(data, list):
                    return []

                now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                for item in data:
                    try:
                        lat = float(item["lat"])
                        lng = float(item["lon"])
                        osm_id = str(item.get("osm_id") or "")
                        osm_type = str(item.get("osm_type") or "")
                        display_name = str(item.get("display_name") or "")
                        osm_class = str(item.get("class") or "")
                        osm_type_detail = str(item.get("type") or "")
                        raw_bbox = item.get("boundingbox")
                        bbox_floats = [float(b) for b in raw_bbox] if raw_bbox else None
                        tags = item.get("extratags") or {}
                        if isinstance(item.get("address"), dict):
                            tags.update({"address": item["address"]})

                        source_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}" if osm_type and osm_id else ""

                        candidate = OSMCandidate(
                            lat=lat,
                            lng=lng,
                            display_name=display_name,
                            osm_id=osm_id,
                            osm_type=osm_type,
                            osm_class=osm_class,
                            osm_type_detail=osm_type_detail,
                            boundingbox=bbox_floats,
                            tags=tags,
                            source="nominatim",
                            source_url=source_url,
                            timestamp=now_iso,
                        )
                        candidates.append(candidate)
                    except (KeyError, TypeError, ValueError) as err:
                        logger.debug("Failed parsing Nominatim candidate: %s", err)
                        continue

                return candidates

            except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                if attempt < self.max_retries - 1:
                    backoff = 1.5 * (attempt + 1)
                    logger.warning("Nominatim request error (%s). Retrying in %.1fs...", exc, backoff)
                    time.sleep(backoff)
                else:
                    logger.error("Nominatim request failed after %d retries: %s", self.max_retries, exc)

        return candidates

    def query_wikidata_p625(self, qid: str) -> Optional[OSMCandidate]:
        """Query Wikidata entity claims for P625 (coordinate location)."""
        if not qid or not qid.startswith("Q"):
            return None

        client = self._get_client()
        self._respect_rate_limit()
        try:
            r = client.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbgetclaims",
                    "entity": qid,
                    "property": "P625",
                    "format": "json",
                },
                headers={"User-Agent": self.user_agent},
            )
            if r.status_code == 200:
                claims = r.json().get("claims", {}).get("P625", [])
                if claims:
                    val = claims[0].get("mainsnak", {}).get("datavalue", {}).get("value", {})
                    lat = float(val["latitude"])
                    lng = float(val["longitude"])
                    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    return OSMCandidate(
                        lat=lat,
                        lng=lng,
                        display_name=f"Wikidata entity {qid}",
                        osm_id=qid,
                        osm_type="item",
                        osm_class="wikidata",
                        osm_type_detail="P625",
                        source="wikidata",
                        source_url=f"https://www.wikidata.org/wiki/{qid}",
                        timestamp=now_iso,
                    )
        except Exception as e:
            logger.debug("Wikidata lookup error for %s: %s", qid, e)
        return None

    def query_wikipedia_coords(self, wiki_title: str) -> Optional[OSMCandidate]:
        """Query English Wikipedia API for article coordinates."""
        if not wiki_title or "List_of_" in wiki_title:
            return None

        client = self._get_client()
        self._respect_rate_limit()
        try:
            r = client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "prop": "coordinates",
                    "titles": wiki_title,
                    "format": "json",
                },
                headers={"User-Agent": self.user_agent},
            )
            if r.status_code == 200:
                pages = r.json().get("query", {}).get("pages", {})
                for page_id, page_data in pages.items():
                    coords = page_data.get("coordinates", [])
                    if coords:
                        lat = float(coords[0]["lat"])
                        lng = float(coords[0]["lon"])
                        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        return OSMCandidate(
                            lat=lat,
                            lng=lng,
                            display_name=f"Wikipedia: {wiki_title.replace('_', ' ')}",
                            osm_id=str(page_id),
                            osm_type="wikipedia",
                            osm_class="wikipedia",
                            osm_type_detail="article_coordinates",
                            source="wikipedia",
                            source_url=f"https://en.wikipedia.org/wiki/{wiki_title}",
                            timestamp=now_iso,
                        )
        except Exception as e:
            logger.debug("Wikipedia coordinates lookup error for %s: %s", wiki_title, e)
        return None

    def query_overpass(self, name_hint: str) -> List[OSMCandidate]:
        """Query Overpass API for features matching name inside Bhopal bounding box."""
        south, west, north, east = self.bbox
        safe_name = name_hint.replace('"', "").replace("'", "").strip()
        if not safe_name:
            return []

        query = (
            f"[out:json][timeout:15];"
            f'('
            f'node({south},{west},{north},{east})["name"~"{safe_name}",i];'
            f'way({south},{west},{north},{east})["name"~"{safe_name}",i];'
            f');'
            f"out center tags 5;"
        )

        client = self._get_client()
        candidates: List[OSMCandidate] = []

        for attempt in range(self.max_retries):
            self._respect_rate_limit()
            try:
                resp = client.post(
                    OVERPASS_URL,
                    data={"data": query},
                    headers={"User-Agent": self.user_agent},
                )
                if resp.status_code == 429:
                    time.sleep(2.0 * (attempt + 1))
                    continue

                resp.raise_for_status()
                data = resp.json() or {}
                elements = data.get("elements") or []

                now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                for el in elements:
                    center = el.get("center") or {}
                    lat = el.get("lat", center.get("lat"))
                    lng = el.get("lon", center.get("lon"))
                    if lat is None or lng is None:
                        continue

                    osm_type = str(el.get("type") or "node")
                    osm_id = str(el.get("id") or "")
                    tags = el.get("tags") or {}
                    name = str(tags.get("name") or safe_name)
                    display_name = f"{name}, Bhopal, Madhya Pradesh, India"

                    candidate = OSMCandidate(
                        lat=float(lat),
                        lng=float(lng),
                        display_name=display_name,
                        osm_id=osm_id,
                        osm_type=osm_type,
                        osm_class=tags.get("tourism") or tags.get("historic") or tags.get("leisure") or tags.get("amenity") or "feature",
                        osm_type_detail=tags.get("building") or tags.get("natural") or "",
                        tags=tags,
                        source="overpass",
                        source_url=f"https://www.openstreetmap.org/{osm_type}/{osm_id}" if osm_id else "",
                        timestamp=now_iso,
                    )
                    candidates.append(candidate)

                return candidates

            except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                if attempt < self.max_retries - 1:
                    time.sleep(1.5 * (attempt + 1))
                else:
                    logger.debug("Overpass request failed: %s", exc)

        return candidates
