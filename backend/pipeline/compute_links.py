from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml

MAX_ANCHOR_DISTANCE_KM = 3.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_links(
    content_dir: Path = Path("content"),
    threshold_km: float = MAX_ANCHOR_DISTANCE_KM,
) -> Dict[str, Any]:
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    working_dir.mkdir(parents=True, exist_ok=True)
    report_path = working_dir / "links_report.md"

    records: List[Tuple[Path, Dict[str, Any]]] = []
    for path in sorted(places_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if data.get("deleted") or data.get("status") == "hold":
            continue
        records.append((path, data))

    with_geo: List[Tuple[Path, Dict[str, Any], float, float]] = []
    missing_geo: List[str] = []
    for path, data in records:
        geo = data.get("geo") or {}
        lat, lng = geo.get("lat"), geo.get("lng")
        if lat is None or lng is None:
            missing_geo.append(str(data.get("id") or path.stem))
            continue
        with_geo.append((path, data, float(lat), float(lng)))

    anchors = [item for item in with_geo if bool(item[1].get("is_anchor", False))]
    non_anchors = [item for item in with_geo if not bool(item[1].get("is_anchor", False))]

    anchor_links: Dict[str, List[Tuple[str, float]]] = {}
    for path, anchor_data, a_lat, a_lng in anchors:
        aid = anchor_data["id"]
        linked: List[Tuple[str, float]] = []
        for _, cand_data, c_lat, c_lng in non_anchors:
            dist = haversine_km(a_lat, a_lng, c_lat, c_lng)
            if dist <= threshold_km:
                linked.append((cand_data["id"], dist))
        linked.sort(key=lambda pair: (pair[1], pair[0]))
        anchor_links[aid] = linked

        anchor_data["anchor_for"] = [pid for pid, _ in linked]
        rendered = yaml.safe_dump(anchor_data, allow_unicode=True, sort_keys=False, width=1000)
        with path.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write(rendered)

    nearest_per_place: List[Tuple[str, str | None, float | None]] = []
    no_anchor_within_threshold: List[str] = []
    for _, cand_data, c_lat, c_lng in non_anchors:
        pid = cand_data["id"]
        if not anchors:
            nearest_per_place.append((pid, None, None))
            no_anchor_within_threshold.append(pid)
            continue
        best = min(
            ((a_data["id"], haversine_km(a_lat, a_lng, c_lat, c_lng)) for _, a_data, a_lat, a_lng in anchors),
            key=lambda pair: (pair[1], pair[0]),
        )
        nearest_per_place.append((pid, best[0], best[1]))
        if best[1] > threshold_km:
            no_anchor_within_threshold.append(pid)

    sparse_anchors = [aid for aid, items in sorted(anchor_links.items()) if len(items) < 3]

    lines: List[str] = [
        "# Anchor-to-Place Links Report",
        "",
        f"- Anchors with geo: {len(anchors)}",
        f"- Non-anchor places with geo: {len(non_anchors)}",
        f"- Places missing geo (skipped): {len(missing_geo)}",
        f"- Distance threshold: {threshold_km:.1f} km (haversine, ignoring incoming approx distances)",
        "",
        "## Per-Anchor Linked Places",
        "",
    ]
    if anchor_links:
        for aid in sorted(anchor_links):
            items = anchor_links[aid]
            lines.append(f"### `{aid}` ({len(items)} linked)")
            if items:
                for pid, dist in items:
                    lines.append(f"- `{pid}`: {dist:.3f} km")
            else:
                lines.append("- _None within 3.0 km_")
            lines.append("")
    else:
        lines.append("_No anchors with coordinates available yet._\n")

    lines.extend(["## Nearest Anchor Per Non-Anchor Place", ""])
    if nearest_per_place:
        for pid, aid, dist in nearest_per_place:
            if aid is not None and dist is not None:
                lines.append(f"- `{pid}` -> `{aid}` ({dist:.3f} km)")
            else:
                lines.append(f"- `{pid}` -> _none_")
    else:
        lines.append("_No non-anchor places with coordinates available yet._")

    lines.extend(["", "## Places With No Anchor Within 3.0 km", ""])
    if no_anchor_within_threshold:
        for pid in no_anchor_within_threshold:
            lines.append(f"- `{pid}`")
    else:
        lines.append("_None (among places with geo)._")

    if missing_geo:
        lines.extend(["", "## Places Missing Geo (Pending Review/Approval)", ""])
        for pid in missing_geo:
            lines.append(f"- `{pid}`")

    lines.extend(["", "## Anchors With Fewer Than 3 Linked Places", ""])
    if sparse_anchors:
        for aid in sparse_anchors:
            lines.append(f"- `{aid}` ({len(anchor_links[aid])} links)")
    else:
        lines.append("_None._")

    with report_path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")

    return {
        "anchors": len(anchors),
        "non_anchors": len(non_anchors),
        "missing_geo": len(missing_geo),
        "no_anchor_within_3km": no_anchor_within_threshold,
        "anchors_lt_3_links": sparse_anchors,
        "report_path": str(report_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute haversine anchor links (<= 3.0 km)")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    args = parser.parse_args()
    summary = compute_links(args.content_dir)
    print(
        f"Links computed: {summary['anchors']} anchors, {summary['non_anchors']} non-anchors "
        f"({summary['missing_geo']} missing geo) -> {summary['report_path']}"
    )


if __name__ == "__main__":
    main()
