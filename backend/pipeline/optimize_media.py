from __future__ import annotations

import colorsys
import io
import math
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image, ImageDraw, ImageFont


def _relative_luminance(rgb: Tuple[int, int, int]) -> float:
    def _chan(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * _chan(r) + 0.7152 * _chan(g) + 0.0722 * _chan(b)


def contrast_ratio_hex(hex_a: str, hex_b: str) -> float:
    def _parse(h: str) -> Tuple[int, int, int]:
        s = h.lstrip("#")
        if len(s) == 3:
            s = "".join(c * 2 for c in s)
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)

    la = _relative_luminance(_parse(hex_a))
    lb = _relative_luminance(_parse(hex_b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def compute_theme_from_image(image_path: Path) -> Dict[str, str]:
    """Deterministically derive {primary, secondary, on_primary} from an image with Pillow."""
    with Image.open(image_path) as raw:
        rgb_img = raw.convert("RGB")
        rgb_img.thumbnail((200, 200), Image.Resampling.LANCZOS)
        quantized = rgb_img.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
        palette = quantized.getpalette() or []
        counts = quantized.getcolors() or []

    # Sort palette entries by descending pixel count, tie-breaking deterministically by color tuple
    weighted: List[Tuple[int, Tuple[int, int, int]]] = []
    for count, idx in counts:
        base = idx * 3
        if base + 2 < len(palette):
            color = (int(palette[base]), int(palette[base + 1]), int(palette[base + 2]))
            weighted.append((int(count), color))
    weighted.sort(key=lambda item: (-item[0], item[1]))

    if not weighted:
        primary_rgb = (37, 93, 72)
        secondary_rgb = (185, 28, 28)
    else:
        primary_rgb = weighted[0][1]
        distinct: List[Tuple[float, Tuple[int, int, int]]] = []
        for _, col in weighted[1:]:
            dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(col, primary_rgb)))
            _, sat, _ = colorsys.rgb_to_hsv(col[0] / 255.0, col[1] / 255.0, col[2] / 255.0)
            if dist >= 30.0:
                distinct.append((sat, col))
        if distinct:
            distinct.sort(key=lambda item: (-item[0], item[1]))
            secondary_rgb = distinct[0][1]
        elif len(weighted) > 1:
            secondary_rgb = weighted[1][1]
        else:
            secondary_rgb = (
                min(255, primary_rgb[0] + 40),
                max(0, primary_rgb[1] - 20),
                min(255, primary_rgb[2] + 40),
            )

    primary_hex = "#{:02x}{:02x}{:02x}".format(*primary_rgb)
    secondary_hex = "#{:02x}{:02x}{:02x}".format(*secondary_rgb)

    white_contrast = contrast_ratio_hex(primary_hex, "#ffffff")
    black_contrast = contrast_ratio_hex(primary_hex, "#000000")
    on_primary = "#ffffff" if white_contrast >= black_contrast else "#000000"

    return {
        "primary": primary_hex,
        "secondary": secondary_hex,
        "on_primary": on_primary,
    }


def _resize_to_max(img: Image.Image, max_dim: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_dim:
        return img.copy()
    if w >= h:
        new_w = max_dim
        new_h = max(1, int(round(h * (max_dim / w))))
    else:
        new_h = max_dim
        new_w = max(1, int(round(w * (max_dim / h))))
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)


def _encode_webp_target(img: Image.Image, target_bytes: int = 80 * 1024) -> bytes:
    rgb = img.convert("RGB")
    best_bytes = b""
    for quality in (82, 72, 62, 50, 40):
        buf = io.BytesIO()
        rgb.save(buf, format="WEBP", quality=quality, method=6)
        data = buf.getvalue()
        best_bytes = data
        if len(data) <= target_bytes:
            break
    return best_bytes


def generate_placeholder_image(label: str, size: Tuple[int, int] = (1200, 800)) -> Image.Image:
    # Deterministic palette derived from label hash
    h = sum(ord(c) for c in label)
    bg = (40 + (h * 17) % 80, 75 + (h * 29) % 80, 95 + (h * 43) % 80)
    img = Image.new("RGB", size, color=bg)
    draw = ImageDraw.Draw(img)
    # Subtle geometric border
    draw.rectangle([24, 24, size[0] - 24, size[1] - 24], outline=(230, 225, 210), width=4)
    font = ImageFont.load_default()
    text = f"VOYEGER BHOPAL\n{label}"
    draw.multiline_text((60, size[1] // 2 - 20), text, fill=(245, 242, 235), font=font, spacing=8)
    return img


def optimize_image_to_pack(
    source_path: Path | None,
    dest_full: Path,
    dest_thumb: Path,
    placeholder_label: str,
) -> None:
    dest_full.parent.mkdir(parents=True, exist_ok=True)
    dest_thumb.parent.mkdir(parents=True, exist_ok=True)

    if source_path is not None and source_path.is_file():
        with Image.open(source_path) as raw:
            # Convert strips EXIF metadata automatically
            img = raw.convert("RGB")
    else:
        img = generate_placeholder_image(placeholder_label)

    full_img = _resize_to_max(img, 1200)
    thumb_img = _resize_to_max(img, 320)

    dest_full.write_bytes(_encode_webp_target(full_img, target_bytes=80 * 1024))
    dest_thumb.write_bytes(_encode_webp_target(thumb_img, target_bytes=24 * 1024))
