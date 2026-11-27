from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import yaml

EN_REMOVE_PATTERNS = (
    "classified",
    "hidden_gem",
    "hidden-gem",
    "recorded here under",
    "official Bhopal tourism portals",
    "Documented on Wikidata and Hindi Wikipedia",
    "radius",
)

HI_REMOVE_PATTERNS = (
    "हिडन जेम",
    "श्रेणी में",
    "विकीडेटा और हिंदी विकिपीडिया",
    "सीमा से बाहर",
)

REVIEW_PATTERNS = (
    "rarely",
    "mainstream",
    "overlooked",
    "absent from",
)

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[।!?])\s+|(?<!\d)(?<=\.)\s+")


@dataclass
class CleanupEntry:
    place_id: str
    field: str
    lang: str
    kind: str  # "REMOVED" | "FLAGGED_EMPTY" | "REVIEW"
    sentence: str


def split_sentences(text: str) -> List[str]:
    stripped = text.strip()
    if not stripped:
        return []
    return [part.strip() for part in _SENTENCE_SPLIT_RE.split(stripped) if part.strip()]


def _has_review_claim(sentence: str) -> bool:
    lowered = sentence.lower()
    return any(pat.lower() in lowered for pat in REVIEW_PATTERNS)


def _matches_removal(sentence: str, lang: str) -> bool:
    if _has_review_claim(sentence):
        return False
    patterns = EN_REMOVE_PATTERNS if lang == "en" else HI_REMOVE_PATTERNS if lang == "hi" else ()
    return any(pat in sentence for pat in patterns)


def clean_field_text(
    place_id: str,
    field: str,
    lang: str,
    raw_text: str,
) -> tuple[str, List[CleanupEntry]]:
    if not raw_text:
        return raw_text, []

    sentences = split_sentences(raw_text)
    if not sentences:
        return raw_text, []

    logs: List[CleanupEntry] = []
    kept: List[str] = []
    candidate_removed: List[str] = []

    for sent in sentences:
        if _has_review_claim(sent):
            logs.append(CleanupEntry(place_id, field, lang, "REVIEW", sent))
            kept.append(sent)
        elif _matches_removal(sent, lang):
            candidate_removed.append(sent)
        else:
            kept.append(sent)

    if candidate_removed:
        if not kept and field in ("summary", "story"):
            # Do not leave summary or story empty; flag instead of removing
            for sent in candidate_removed:
                logs.append(CleanupEntry(place_id, field, lang, "FLAGGED_EMPTY", sent))
            return raw_text, logs

        for sent in candidate_removed:
            logs.append(CleanupEntry(place_id, field, lang, "REMOVED", sent))
        return " ".join(kept), logs

    # Unmodified text stays byte-identical
    return raw_text, logs


def cleanup_content_dir(content_dir: Path = Path("content")) -> Dict[str, Any]:
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    working_dir.mkdir(parents=True, exist_ok=True)
    log_path = working_dir / "cleanup_log.md"

    all_entries: List[CleanupEntry] = []
    modified_files = 0

    if places_dir.is_dir():
        for path in sorted(places_dir.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            pid = data.get("id") or path.stem
            text_map = data.get("text") or {}
            changed = False

            for lang in ("en", "hi"):
                lang_block = text_map.get(lang)
                if not isinstance(lang_block, dict):
                    continue
                for field in ("title", "summary", "story"):
                    original = str(lang_block.get(field) or "")
                    cleaned, entries = clean_field_text(pid, field, lang, original)
                    all_entries.extend(entries)
                    if cleaned != original:
                        lang_block[field] = cleaned
                        changed = True

            if changed:
                rendered = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000)
                with path.open("w", encoding="utf-8", newline="\n") as fh:
                    fh.write(rendered)
                modified_files += 1

    removed = [e for e in all_entries if e.kind == "REMOVED"]
    flagged_empty = [e for e in all_entries if e.kind == "FLAGGED_EMPTY"]
    reviews = [e for e in all_entries if e.kind == "REVIEW"]

    lines: List[str] = [
        "# Text Cleanup Log",
        "",
        f"- Removed sentences: {len(removed)}",
        f"- Flagged (would leave empty): {len(flagged_empty)}",
        f"- Human review items (unchanged): {len(reviews)}",
        "",
        "## Removed Sentences",
        "",
    ]
    if removed:
        lines.append("| id | field | lang | removed text |")
        lines.append("| --- | --- | --- | --- |")
        for e in removed:
            safe_sent = e.sentence.replace("|", "\\|")
            lines.append(f"| `{e.place_id}` | `{e.field}` | `{e.lang}` | {safe_sent} |")
    else:
        lines.append("_None removed on this run._")

    lines.extend(["", "## Flagged (Would Empty Field — Left Intact)", ""])
    if flagged_empty:
        lines.append("| id | field | lang | sentence |")
        lines.append("| --- | --- | --- | --- |")
        for e in flagged_empty:
            safe_sent = e.sentence.replace("|", "\\|")
            lines.append(f"| `{e.place_id}` | `{e.field}` | `{e.lang}` | {safe_sent} |")
    else:
        lines.append("_None._")

    lines.extend(["", "## REVIEW (Unverified Obscurity Claims — Unchanged)", ""])
    if reviews:
        lines.append("| id | field | lang | sentence |")
        lines.append("| --- | --- | --- | --- |")
        for e in reviews:
            safe_sent = e.sentence.replace("|", "\\|")
            lines.append(f"| `{e.place_id}` | `{e.field}` | `{e.lang}` | {safe_sent} |")
    else:
        lines.append("_None._")

    with log_path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")

    return {
        "modified_files": modified_files,
        "removed_count": len(removed),
        "flagged_empty_count": len(flagged_empty),
        "review_count": len(reviews),
        "log_path": str(log_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean leaked editorial text deterministically")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    args = parser.parse_args()
    summary = cleanup_content_dir(args.content_dir)
    print(
        f"Cleanup complete: {summary['removed_count']} removed across {summary['modified_files']} files, "
        f"{summary['flagged_empty_count']} flagged-empty, {summary['review_count']} REVIEW items -> {summary['log_path']}"
    )


if __name__ == "__main__":
    main()
