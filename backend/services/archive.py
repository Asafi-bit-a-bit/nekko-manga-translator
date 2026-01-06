"""
Archive extraction service.
"""
import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import List

from fastapi import HTTPException

from config import HAS_7Z, HAS_RAR, IMAGE_EXTENSIONS, TMP_DIR
from logging_config import log_event

# Import archive libraries if available
if HAS_7Z:
    import py7zr
if HAS_RAR:
    import rarfile


def extract_archive(archive_path: Path, logger) -> List[dict]:
    """Extract archive and return list of extracted image files."""
    extracted = []
    suffix = archive_path.suffix.lower()
    extract_dir = TMP_DIR / f"extract_{archive_path.stem}"
    
    # Verify archive file exists and is readable
    if not archive_path.exists():
        raise HTTPException(status_code=400, detail=f"Archive file not found: {archive_path.name}")
    
    if not archive_path.is_file():
        raise HTTPException(status_code=400, detail=f"Archive path is not a file: {archive_path.name}")
    
    try:
        file_size = archive_path.stat().st_size
        if file_size == 0:
            raise HTTPException(status_code=400, detail=f"Archive file is empty: {archive_path.name}")
        log_event("[extract] archive_info", logger, path=str(archive_path), size=file_size, suffix=suffix)
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"Cannot access archive file: {e}") from e
    
    extract_dir.mkdir(exist_ok=True)

    try:
        if suffix == ".zip":
            try:
                with zipfile.ZipFile(archive_path, 'r') as zf:
                    # Test if ZIP file is valid
                    zf.testzip()
                    zf.extractall(extract_dir)
            except zipfile.BadZipFile as e:
                raise HTTPException(status_code=400, detail=f"Invalid ZIP archive: {e}") from e
            except zipfile.LargeZipFile as e:
                raise HTTPException(status_code=400, detail=f"ZIP file too large: {e}") from e
        elif suffix == ".7z":
            if not HAS_7Z:
                raise HTTPException(status_code=400, detail="7z format requires py7zr library")
            try:
                with py7zr.SevenZipFile(archive_path, 'r') as szf:
                    szf.extractall(extract_dir)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to extract 7z archive: {e}") from e
        elif suffix == ".rar":
            if not HAS_RAR:
                raise HTTPException(status_code=400, detail="RAR format requires rarfile library and unrar utility")
            try:
                with rarfile.RarFile(archive_path, 'r') as rf:
                    rf.extractall(extract_dir)
            except rarfile.RarCannotExec as e:
                raise HTTPException(status_code=400, detail=f"RAR extraction failed (unrar not found): {e}") from e
            except rarfile.RarCannotOpen as e:
                raise HTTPException(status_code=400, detail=f"Cannot open RAR archive: {e}") from e
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to extract RAR archive: {e}") from e
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported archive format: {suffix}")

        # Find all image files recursively
        for root, dirs, files in os.walk(extract_dir):
            # Sort files for consistent ordering
            for fname in sorted(files):
                fpath = Path(root) / fname
                if fpath.suffix.lower() in IMAGE_EXTENSIONS:
                    # Copy to tmp with unique id
                    new_id = uuid.uuid4().hex
                    new_path = TMP_DIR / f"{new_id}{fpath.suffix.lower()}"
                    shutil.copy2(fpath, new_path)
                    extracted.append({
                        "id": new_id,
                        "name": fname,
                        "path": str(new_path),
                    })
                    log_event("[extract] image_found", logger, name=fname, new_id=new_id)

        # Cleanup extract dir
        shutil.rmtree(extract_dir, ignore_errors=True)
        log_event("[extract] complete", logger, archive=archive_path.name, count=len(extracted))

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise
    except Exception as exc:
        logger.exception("[extract] failed", extra={"archive": str(archive_path)})
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Archive extraction failed: {str(exc)}") from exc

    return extracted

