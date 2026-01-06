"""
Device management utilities for PyTorch.
"""
import os
import platform
from typing import Optional

import torch

from logging_config import log_event


def resolve_ocr_device() -> torch.device:
    """Resolve device for OCR models."""
    override = os.getenv("OCR_DEVICE")
    if override:
        return torch.device(override)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _get_cuda_vram_gb() -> Optional[float]:
    """Get CUDA VRAM in GB."""
    if not torch.cuda.is_available():
        return None
    try:
        props = torch.cuda.get_device_properties(0)
        return props.total_memory / (1024**3)
    except Exception:
        return None


def resolve_paddle_device(requested: torch.device, logger) -> torch.device:
    """Resolve device for PaddleOCR-VL (handles MPS and VRAM constraints)."""
    override = os.getenv("PADDLE_OCR_DEVICE")
    if override:
        return torch.device(override)
    if requested.type == "mps":
        return torch.device("cpu")
    if requested.type != "cuda":
        return torch.device("cpu")
    if platform.system() == "Windows":
        min_gb_raw = os.getenv("PADDLE_OCR_MIN_VRAM_GB", "2")
        try:
            min_gb = float(min_gb_raw)
        except ValueError:
            min_gb = 6.0
        vram_gb = _get_cuda_vram_gb()
        if vram_gb is not None and (vram_gb + 0.25) < min_gb:
            log_event(
                "[ocr] paddleocr_vl_cuda_skip",
                logger,
                reason="low_vram",
                vram_gb=round(vram_gb, 2),
                min_gb=min_gb,
            )
            return torch.device("cpu")
    return requested


def paddleocr_default_dtype(device: torch.device) -> torch.dtype:
    """Get default dtype for PaddleOCR-VL based on device."""
    if device.type in {"cuda", "mps"}:
        return torch.float16
    return torch.float32

