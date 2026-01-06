"""
Box manipulation utilities.
"""
import json
import time
import uuid
from pathlib import Path
from typing import List, Optional

from config import TMP_DIR
from logging_config import log_event


def normalize_boxes(boxes_px: List[dict], size: tuple[int, int]) -> List[dict]:
    """Convert pixel boxes to normalized [0,1] coords. Expects boxes with x,y,w,h in pixels."""
    w, h = size
    normed = []
    for b in boxes_px:
        normed.append(
            {
                "id": b.get("id") or uuid.uuid4().hex,
                "type": b.get("type"),
                "score": b.get("score"),
                "x": b["x"] / w,
                "y": b["y"] / h,
                "w": b["w"] / w,
                "h": b["h"] / h,
            }
        )
    return normed


def boxes_cache_path(file_id: str) -> Path:
    """Get path for boxes cache file."""
    return TMP_DIR / f"{file_id}.boxes.json"


def save_boxes_cache(file_id: str, boxes: List[dict], logger, meta: Optional[dict] = None):
    """Save boxes to cache file."""
    if meta is None:
        path = boxes_cache_path(file_id)
        if path.exists():
            try:
                existing = json.loads(path.read_text())
                meta = existing.get("meta")
            except Exception:
                meta = None
    payload = {
        "file_id": file_id,
        "saved_at": time.time(),
        "boxes": boxes,
        "meta": meta,
    }
    path = boxes_cache_path(file_id)
    path.write_text(json.dumps(payload, ensure_ascii=True))
    log_event("[detect] cache_saved", logger, file_id=file_id, path=str(path), count=len(boxes))


def boxes_overlap(a: dict, b: dict) -> bool:
    """Check if two boxes overlap."""
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    inter_w = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    inter_h = max(0.0, min(ay2, by2) - max(ay1, by1))
    return inter_w > 0 and inter_h > 0


def suppress_overlaps(boxes: List[dict], max_boxes: int) -> List[dict]:
    """
    Keep highest-score boxes without any overlap (strict).
    """
    kept: List[dict] = []
    for b in sorted(boxes, key=lambda x: x["score"], reverse=True):
        if any(boxes_overlap(b, k) for k in kept):
            continue
        kept.append(b)
        if len(kept) >= max_boxes:
            break
    return kept

