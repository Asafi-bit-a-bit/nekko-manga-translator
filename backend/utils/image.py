"""
Image processing utilities.
"""
from pathlib import Path
from typing import Optional, Tuple

from fastapi import HTTPException
from PIL import Image

from config import IMAGE_EXTENSIONS, OCR_CROP_PAD_RATIO, TMP_DIR
from logging_config import log_event


def ensure_image(path: Path, logger) -> Image.Image:
    """Open and convert image to RGB."""
    try:
        img = Image.open(path).convert("RGB")
        log_event(
            "[image] opened",
            logger,
            path=str(path),
            size=img.size,
            mode=img.mode,
        )
        return img
    except Exception as exc:
        logger.exception("[image] failed to open %s", path)
        raise HTTPException(status_code=400, detail=f"Cannot open image: {exc}") from exc


def resolve_image_path(file_id: str) -> Path:
    """Resolve image path from file_id."""
    direct = TMP_DIR / f"{file_id}"
    if direct.exists():
        return direct
    candidates = list(TMP_DIR.glob(f"{file_id}.*"))
    for p in candidates:
        if p.suffix.lower() in IMAGE_EXTENSIONS:
            return p
    for p in candidates:
        if p.name.endswith(".boxes.json") or p.suffix.lower() == ".json":
            continue
        return p
    return direct


def resize_for_model(img: Image.Image, max_side: int = 1280) -> Tuple[Image.Image, dict]:
    """
    Resize image keeping aspect ratio so that max(width, height) <= max_side.
    Normalized coordinates stay identical between original and resized because scaling is uniform.
    Keeps image in RGB mode for better OCR quality.
    """
    w, h = img.size
    scale = min(max_side / max(w, h), 1.0)
    if scale < 1.0:
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = w, h
    # Keep in RGB mode (no grayscale conversion)
    return img, {"orig_size": (w, h), "resized_size": (new_w, new_h), "scale": scale}


def denormalize_box(box: dict, size: Tuple[int, int]) -> Tuple[int, int, int, int]:
    """Convert normalized box coordinates to pixel coordinates."""
    width, height = size
    try:
        x = float(box.get("x", 0.0))
        y = float(box.get("y", 0.0))
        w = float(box.get("w", 0.0))
        h = float(box.get("h", 0.0))
    except (TypeError, ValueError):
        return 0, 0, 0, 0
    x1 = int(round(x * width))
    y1 = int(round(y * height))
    x2 = int(round((x + w) * width))
    y2 = int(round((y + h) * height))
    x1 = max(0, min(x1, width - 1))
    y1 = max(0, min(y1, height - 1))
    x2 = max(x1 + 1, min(x2, width))
    y2 = max(y1 + 1, min(y2, height))
    return x1, y1, x2, y2


def crop_box(
    img: Image.Image, box: dict, pad_ratio: float = OCR_CROP_PAD_RATIO
) -> Tuple[Optional[Image.Image], Optional[Tuple[int, int, int, int]]]:
    """Crop image region from box with padding."""
    x1, y1, x2, y2 = denormalize_box(box, img.size)
    if x2 <= x1 or y2 <= y1:
        return None, None
    pad_x = max(1, int((x2 - x1) * pad_ratio))
    pad_y = max(1, int((y2 - y1) * pad_ratio))
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(img.width, x2 + pad_x)
    y2 = min(img.height, y2 + pad_y)
    if x2 <= x1 or y2 <= y1:
        return None, None
    return img.crop((x1, y1, x2, y2)), (x1, y1, x2, y2)

