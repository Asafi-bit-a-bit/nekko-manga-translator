"""
File upload service.
"""
import os
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from config import TMP_DIR
from logging_config import log_event
from utils.image import resolve_image_path


def save_upload(file: UploadFile, logger) -> Path:
    """Save uploaded file to tmp directory."""
    suffix = Path(file.filename or "").suffix
    file_id = uuid.uuid4().hex
    target = TMP_DIR / f"{file_id}{suffix}"
    try:
        with target.open("wb") as f:
            shutil.copyfileobj(file.file, f)
            f.flush()
            os.fsync(f.fileno())
    except Exception as e:
        logger.exception("[upload] save_failed", file_id=file_id, filename=file.filename)
        if target.exists():
            try:
                target.unlink()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}") from e
    
    try:
        size = target.stat().st_size
        if size == 0:
            logger.warning("[upload] file_is_empty", file_id=file_id, filename=file.filename)
    except Exception:
        size = None
    log_event(
        "[upload] saved",
        logger,
        file_id=file_id,
        original_name=file.filename,
        suffix=suffix,
        size_bytes=size,
        path=str(target),
    )
    return target

