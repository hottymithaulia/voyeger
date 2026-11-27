from __future__ import annotations

import os
import sys

import httpx


def main() -> int:
    base = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
    all_ok = True

    def _report(name: str, ok: bool, detail: str = "") -> None:
        nonlocal all_ok
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_ok = False
        print(f"[{status}] {name}" + (f" ({detail})" if detail else ""))

    with httpx.Client(timeout=5.0) as client:
        # 1. Health GET & HEAD
        try:
            r_head = client.head(f"{base}/api/health")
            r_get = client.get(f"{base}/api/health")
            _report(
                "GET/HEAD /api/health",
                r_head.status_code == 200 and r_get.status_code == 200,
                f"GET={r_get.status_code} HEAD={r_head.status_code}",
            )
        except Exception as exc:
            _report("GET/HEAD /api/health", False, str(exc))
            return 1

        # 2. Manifest
        version = 1
        try:
            r_man = client.get(f"{base}/api/manifest")
            ok = r_man.status_code == 200 and "version" in r_man.json()
            if ok:
                version = r_man.json()["version"]
            _report("GET /api/manifest", ok, f"status={r_man.status_code} version={version}")
        except Exception as exc:
            _report("GET /api/manifest", False, str(exc))

        # 3. Pack file + Range
        try:
            r_pack = client.get(f"{base}/pack/v{version}/places.json")
            r_pack_range = client.get(
                f"{base}/pack/v{version}/places.json",
                headers={"Range": "bytes=0-127"},
            )
            _report(
                f"GET /pack/v{version}/places.json + Range",
                r_pack.status_code == 200 and r_pack_range.status_code == 206,
                f"full={r_pack.status_code} range={r_pack_range.status_code}",
            )
        except Exception as exc:
            _report("GET /pack file", False, str(exc))

        # 4. Tiles Range request
        try:
            r_tile = client.get(
                f"{base}/tiles/bhopal.pmtiles",
                headers={"Range": "bytes=0-1023"},
            )
            if r_tile.status_code == 404:
                _report("Range /tiles/bhopal.pmtiles", True, "404 (bhopal.pmtiles not added yet)")
            else:
                _report(
                    "Range /tiles/bhopal.pmtiles",
                    r_tile.status_code == 206 and "Content-Range" in r_tile.headers,
                    f"status={r_tile.status_code}",
                )
        except Exception as exc:
            _report("Range /tiles/bhopal.pmtiles", False, str(exc))

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
