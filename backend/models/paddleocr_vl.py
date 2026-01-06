"""
PaddleOCR-VL model loading and management.
"""
import inspect
from typing import Optional

import torch
from transformers import AutoModelForCausalLM, AutoProcessor

from config import PADDLE_OCR_VL_DIR
from logging_config import log_event
from utils.device import paddleocr_default_dtype, resolve_paddle_device

# Global cache for PaddleOCR-VL model
_paddle_ocr_model = None
_paddle_ocr_processor = None
_paddle_ocr_device = None
_paddle_ocr_dtype = None


def load_paddleocr_vl(device: torch.device, logger):
    """Load PaddleOCR-VL model with caching."""
    global _paddle_ocr_model, _paddle_ocr_processor, _paddle_ocr_device, _paddle_ocr_dtype
    # Avoid MPS for PaddleOCR-VL; use CUDA on Windows when possible.
    target_device = resolve_paddle_device(device, logger)
    dtype = paddleocr_default_dtype(target_device)
    if (
        _paddle_ocr_model is not None
        and _paddle_ocr_processor is not None
        and _paddle_ocr_device == target_device
        and _paddle_ocr_dtype == dtype
    ):
        return _paddle_ocr_model, _paddle_ocr_processor
    if not PADDLE_OCR_VL_DIR.exists():
        raise RuntimeError("paddleocr-vl-for-manga directory not found")
    
    log_event(
        "[ocr] loading_paddleocr_vl",
        logger,
        model_dir=str(PADDLE_OCR_VL_DIR),
        device=str(target_device),
        dtype=str(dtype),
    )
    processor = AutoProcessor.from_pretrained(str(PADDLE_OCR_VL_DIR), trust_remote_code=True)

    def _load_with_dtype(target: torch.device, target_dtype: torch.dtype):
        try:
            model = AutoModelForCausalLM.from_pretrained(
                str(PADDLE_OCR_VL_DIR),
                trust_remote_code=True,
                torch_dtype=target_dtype,
                low_cpu_mem_usage=True,
            )
            return model, target_dtype
        except Exception as exc:
            if target_dtype != torch.float32:
                log_event(
                    "[ocr] paddleocr_vl_dtype_fallback",
                    logger,
                    requested_dtype=str(target_dtype),
                    error=str(exc),
                )
                model = AutoModelForCausalLM.from_pretrained(
                    str(PADDLE_OCR_VL_DIR),
                    trust_remote_code=True,
                    torch_dtype=torch.float32,
                    low_cpu_mem_usage=True,
                )
                return model, torch.float32
            raise

    try:
        model, dtype = _load_with_dtype(target_device, dtype)
    except Exception as exc:
        if target_device.type == "cuda":
            log_event("[ocr] paddleocr_vl_cuda_failed", logger, error=str(exc))
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass
            target_device = torch.device("cpu")
            dtype = torch.float32
            model, dtype = _load_with_dtype(target_device, dtype)
        else:
            raise
    model.to(target_device)
    if target_device.type == "cuda":
        try:
            model.half()
            dtype = torch.float16
        except Exception as exc:
            log_event(
                "[ocr] paddleocr_vl_half_failed",
                logger,
                error=str(exc),
            )
    model.eval()
    if hasattr(model, "model") and hasattr(model.model, "forward"):
        original_forward = model.model.forward
        base_forward = original_forward
        try:
            unwrapped = original_forward
            while hasattr(unwrapped, "__wrapped__"):
                unwrapped = unwrapped.__wrapped__
            base_forward = unwrapped
            if getattr(base_forward, "__self__", None) is None:
                base_forward = base_forward.__get__(model.model, model.model.__class__)
            signature = inspect.signature(base_forward)
            has_var_kwargs = any(
                param.kind == inspect.Parameter.VAR_KEYWORD for param in signature.parameters.values()
            )
            allowed_kwargs = set(signature.parameters.keys())
        except Exception:
            has_var_kwargs = True
            allowed_kwargs = set()

        def _safe_forward(*args, **kwargs):
            if not has_var_kwargs and allowed_kwargs:
                kwargs = {k: v for k, v in kwargs.items() if k in allowed_kwargs}
            return base_forward(*args, **kwargs)

        model.model.forward = _safe_forward
    _paddle_ocr_model = model
    _paddle_ocr_processor = processor
    _paddle_ocr_device = target_device
    _paddle_ocr_dtype = dtype
    log_event("[ocr] paddleocr_vl_ready", logger, device=str(target_device), dtype=str(dtype))
    return _paddle_ocr_model, _paddle_ocr_processor


def build_paddle_prompt(processor, lang: Optional[str]) -> str:
    """Build prompt for PaddleOCR-VL."""
    lang_map = {"ja": "Japanese", "en": "English", "zh": "Chinese"}
    lang_name = lang_map.get(lang or "", "auto")
    prompt = (
        "Recognize the text in the image. "
        "Return only the transcribed text and keep line breaks. "
        f"Language: {lang_name}."
    )
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image"},
                {"type": "text", "text": prompt},
            ],
        }
    ]
    if hasattr(processor, "apply_chat_template"):
        return processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    # Fallback for unexpected processor versions
    return f"<|begin_of_sentence|>User: <|IMAGE_START|><|IMAGE_PLACEHOLDER|><|IMAGE_END|>{prompt}\nAssistant: "


def get_paddle_device():
    """Get current PaddleOCR-VL device (for use in services)."""
    global _paddle_ocr_device
    return _paddle_ocr_device

