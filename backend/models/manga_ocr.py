"""
Manga OCR model loading and management.
"""
import sys
import importlib.util
import torch

from config import COMIC_TRANSLATE_DIR
from logging_config import log_event

# Global cache for manga OCR model
_manga_ocr_model = None
_manga_ocr_device = None


def load_manga_ocr(device: torch.device, logger):
    """Load manga OCR model with caching."""
    global _manga_ocr_model, _manga_ocr_device
    if _manga_ocr_model is not None and _manga_ocr_device == device:
        return _manga_ocr_model
    if not COMIC_TRANSLATE_DIR.exists():
        raise RuntimeError("comic-translate directory not found")
    try:
        sys.path.insert(0, str(COMIC_TRANSLATE_DIR))
        from modules.utils.download import ModelDownloader, ModelID
        from modules.ocr.manga_ocr.engine import MangaOcr
    except Exception as exc:
        download_py = COMIC_TRANSLATE_DIR / "modules" / "utils" / "download.py"
        engine_py = COMIC_TRANSLATE_DIR / "modules" / "ocr" / "manga_ocr" / "engine.py"
        if not download_py.exists() or not engine_py.exists():
            raise RuntimeError(f"Failed to import comic-translate OCR modules: {exc}") from exc
        try:
            dl_spec = importlib.util.spec_from_file_location("ct_download", download_py)
            dl_mod = importlib.util.module_from_spec(dl_spec)
            dl_spec.loader.exec_module(dl_mod)
            eng_spec = importlib.util.spec_from_file_location("ct_manga_ocr_engine", engine_py)
            eng_mod = importlib.util.module_from_spec(eng_spec)
            eng_spec.loader.exec_module(eng_mod)
            ModelDownloader = dl_mod.ModelDownloader
            ModelID = dl_mod.ModelID
            MangaOcr = eng_mod.MangaOcr
        except Exception as exc2:
            raise RuntimeError(f"Failed to import comic-translate OCR modules: {exc2}") from exc2
    ModelDownloader.get(ModelID.MANGA_OCR_BASE)
    model_dir = COMIC_TRANSLATE_DIR / "models" / "ocr" / "manga-ocr-base"
    if not model_dir.exists():
        raise RuntimeError(f"Manga OCR weights not found at {model_dir}")
    log_event("[ocr] loading_manga_ocr", logger, model_dir=str(model_dir), device=str(device))
    model = MangaOcr(pretrained_model_name_or_path=str(model_dir), device=str(device))
    model.model.eval()
    _manga_ocr_model = model
    _manga_ocr_device = device
    log_event("[ocr] manga_ocr_ready", logger, device=str(device))
    return _manga_ocr_model
