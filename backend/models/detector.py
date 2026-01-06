"""
Detector model loading and management.
"""
import torch
from transformers import AutoImageProcessor, AutoModelForObjectDetection

from config import DETECTOR_DIR
from utils.device import resolve_ocr_device
from logging_config import log_event

# Global cache for detector model
_det_model = None
_det_processor = None


def load_detector(logger):
    """Load detector model with caching."""
    global _det_model, _det_processor
    if _det_model is not None and _det_processor is not None:
        log_event("[detect] model_cache_hit", logger, device=str(next(_det_model.parameters()).device))
        return _det_model, _det_processor
    if not DETECTOR_DIR.exists():
        raise RuntimeError("Detector directory not found")
    weight_files = list(DETECTOR_DIR.glob("*.safetensors")) or list(DETECTOR_DIR.glob("*.bin"))
    if not weight_files:
        raise RuntimeError(
            f"No weight files found in {DETECTOR_DIR}. Expected *.safetensors or *.bin. "
            "If you cloned with git LFS, run `git lfs pull`."
        )
    weight_path = weight_files[0]
    size_bytes = weight_path.stat().st_size
    if size_bytes < 1024 * 1024:  # clearly a pointer/small file
        raise RuntimeError(
            f"Weight file too small ({size_bytes} bytes): {weight_path}. "
            "Looks like a git-lfs pointer. Run `git lfs install && git lfs pull` in the repo to fetch real weights."
        )
    log_event("[detect] loading_model", logger, detector_dir=str(DETECTOR_DIR))
    _det_processor = AutoImageProcessor.from_pretrained(DETECTOR_DIR)
    _det_model = AutoModelForObjectDetection.from_pretrained(
        DETECTOR_DIR, torch_dtype=torch.float32
    )
    device = resolve_ocr_device()
    _det_model.to(device)
    _det_model.eval()
    log_event(
        "[detect] model_ready",
        logger,
        device=str(device),
        labels=getattr(_det_model.config, "id2label", {}),
        dtype=str(next(_det_model.parameters()).dtype),
    )
    return _det_model, _det_processor

