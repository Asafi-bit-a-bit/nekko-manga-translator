"""
OCR service.
"""
import math
import time
import numpy as np
import torch
from PIL import Image
from typing import Optional

from models.manga_ocr import load_manga_ocr
from models.paddleocr_vl import build_paddle_prompt, get_paddle_device, load_paddleocr_vl
from utils.device import resolve_ocr_device
from utils.image import crop_box
from utils.text import normalize_punctuation
from logging_config import log_event


def normalize_ocr_text(text: str) -> str:
    """Normalize OCR text output."""
    if not text:
        return ""
    cleaned = (
        text.replace("<br />", "\n")
        .replace("<br/>", "\n")
        .replace("<br>", "\n")
        .replace("\\n", "\n")
        .strip()
    )
    if cleaned.lower().startswith("assistant:"):
        cleaned = cleaned.split(":", 1)[1].lstrip()
    # Check if result is empty (empty string or only whitespace)
    if not cleaned or not cleaned.strip():
        return ""
    # Apply punctuation normalization
    cleaned = normalize_punctuation(cleaned)
    return cleaned


def run_manga_ocr(crop: Image.Image, device: torch.device, logger) -> str:
    """Run manga-ocr on crop."""
    model = load_manga_ocr(device, logger)
    np_img = np.array(crop)
    start = time.perf_counter()
    text = model(np_img)
    duration_ms = int((time.perf_counter() - start) * 1000)
    log_event(
        "[ocr] manga_ocr_box",
        logger,
        duration_ms=duration_ms,
        crop_size=(crop.width, crop.height),
    )
    return normalize_ocr_text(text)


def run_paddleocr_vl(crop: Image.Image, device: torch.device, lang: Optional[str], logger) -> str:
    """Run PaddleOCR-VL on crop."""
    model, processor = load_paddleocr_vl(device, logger)
    paddle_device = get_paddle_device() or next(model.parameters()).device
    prompt = build_paddle_prompt(processor, lang)
    inputs = processor(images=crop, text=prompt, return_tensors="pt")
    inputs = {k: v.to(paddle_device) for k, v in inputs.items()}
    if paddle_device.type == "cuda":
        inputs = {k: (v.half() if torch.is_floating_point(v) else v) for k, v in inputs.items()}
    area = max(1, crop.width * crop.height)
    # Adaptive max_new_tokens based on bubble size, with a fixed minimum.
    max_new_tokens = int(round(0.13 * math.sqrt(area)))
    max_new_tokens = max(18, min(64, max_new_tokens))
    start = time.perf_counter()
    with torch.no_grad():
        generated = model.generate(
            **inputs,
            do_sample=False,
            max_new_tokens=max_new_tokens,
        )
    duration_ms = int((time.perf_counter() - start) * 1000)
    input_len = inputs.get("input_ids").shape[-1] if "input_ids" in inputs else 0
    if input_len:
        generated = generated[:, input_len:]
    decoded = processor.post_process_image_text_to_text(generated, skip_special_tokens=True)
    text = decoded[0] if decoded else ""
    log_event(
        "[ocr] paddleocr_vl_box",
        logger,
        duration_ms=duration_ms,
        max_new_tokens=max_new_tokens,
        crop_size=(crop.width, crop.height),
    )
    return normalize_ocr_text(text)
