"""
File-based cache for geographic lookups to ensure idempotency and polite API usage.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional


class GeoCache:
    """File-backed JSON cache for lookup queries and candidates."""

    def __init__(self, cache_path: Path):
        self.cache_path = cache_path
        self._data: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if self.cache_path.is_file():
            try:
                self._data = json.loads(self.cache_path.read_text(encoding="utf-8"))
            except Exception:
                self._data = {}
        else:
            self._data = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached result for a key."""
        entry = self._data.get(key)
        if entry and isinstance(entry, dict):
            return entry.get("result")
        return None

    def set(self, key: str, result: Optional[Dict[str, Any]], query: str = "") -> None:
        """Store a lookup result."""
        self._data[key] = {
            "query": query,
            "result": result,
        }

    def save(self) -> None:
        """Persist cache to disk."""
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.cache_path.with_suffix(".tmp")
        with temp_path.open("w", encoding="utf-8", newline="\n") as fh:
            json.dump(self._data, fh, ensure_ascii=False, indent=2, sort_keys=True)
        temp_path.replace(self.cache_path)

    def count(self) -> int:
        return len(self._data)
