"""
API routes for the OCR backend.
"""
import json
import time
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import Body, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from config import TMP_DIR
from logging_config import log_event
from services.archive import extract_archive
from services.detection import run_detection
from services.file_upload import save_upload
from services.ocr import run_manga_ocr, run_paddleocr_vl
from services.system import get_cpu_name
from services.translation import translate_text_stream, translate_texts
from utils.boxes import boxes_cache_path, save_boxes_cache
from utils.device import resolve_ocr_device
from utils.image import crop_box, ensure_image, resolve_image_path, resize_for_model


def register_routes(app, logger):
    """Register all API routes."""
    
    @app.get("/api/system/cpu")
    async def system_cpu():
        return {"cpu": get_cpu_name()}

    @app.get("/api/cleanup/tmp")
    async def cleanup_tmp():
        removed = []
        for p in TMP_DIR.glob("*"):
            try:
                p.unlink()
                removed.append(p.name)
            except FileNotFoundError:
                continue
        log_event("[cleanup_tmp] done", logger, removed=removed)
        return {"removed": removed}

    @app.post("/api/upload")
    async def upload_files(files: List[UploadFile] = File(...)):
        """Save uploads into tmp/. Archives are automatically extracted."""
        log_event(
            "[upload] request",
            logger,
            files_count=len(files),
            names=[f.filename for f in files],
        )
        saved = []
        for f in files:
            path = save_upload(f, logger)
            suffix = path.suffix.lower()
            
            # Check if it's an archive
            if suffix in {".zip", ".7z", ".rar"}:
                log_event("[upload] archive_detected", logger, name=f.filename, suffix=suffix)
                try:
                    extracted = extract_archive(path, logger)
                    if not extracted:
                        log_event("[upload] archive_empty", logger, name=f.filename, suffix=suffix)
                        # Archive was extracted but contained no image files
                        # Remove original archive and continue
                        try:
                            path.unlink()
                        except Exception:
                            pass
                        continue
                    for img in extracted:
                        saved.append({
                            "id": img["id"],
                            "name": img["name"],
                            "client_name": img["name"],
                            "path": img["path"],
                            "isArchive": False,
                            "fromArchive": f.filename,
                        })
                    # Remove original archive
                    try:
                        path.unlink()
                    except Exception:
                        pass
                except HTTPException:
                    # Re-raise HTTP exceptions to return proper error to client
                    raise
                except Exception as exc:
                    logger.exception("[upload] archive_extraction_error", name=f.filename)
                    # Clean up archive file
                    try:
                        path.unlink()
                    except Exception:
                        pass
                    raise HTTPException(status_code=500, detail=f"Failed to extract archive {f.filename}: {str(exc)}") from exc
            else:
                saved.append(
                    {
                        "id": path.stem,
                        "name": Path(f.filename or path.name).name,
                        "client_name": f.filename,
                        "path": str(path),
                        "isArchive": False,
                    }
                )
        log_event("[upload] response", logger, saved_count=len(saved))
        return {"files": saved}

    @app.get("/api/image/{file_id}")
    async def get_image(file_id: str):
        """Serve image file by its ID."""
        image_path = resolve_image_path(file_id)
        if not image_path.exists():
            raise HTTPException(status_code=404, detail=f"Image not found: {file_id}")
        
        # Determine media type based on extension
        ext = image_path.suffix.lower()
        media_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
        }
        media_type = media_types.get(ext, "image/png")
        
        return FileResponse(image_path, media_type=media_type)

    @app.post("/api/detect")
    async def detect(
        file_id: str = Form(...),
        max_boxes: int = Form(10),
        threshold: float = Form(0.66),
    ):
        """Detection via RT-DETR (transformers) on resized image (max side 1280)."""
        image_path = resolve_image_path(file_id)
        if not image_path.exists():
            listing = [p.name for p in TMP_DIR.glob("*")]
            log_event("[detect] missing_file", logger, file_id=file_id, tmp_listing=listing)
            raise HTTPException(
                status_code=404,
                detail=f"File not found for id={file_id}. tmp contents={listing}",
            )
        
        try:
            response = run_detection(file_id, image_path, max_boxes, threshold, logger)
            return response
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.get("/api/boxes")
    async def get_cached_boxes(file_id: str):
        path = boxes_cache_path(file_id)
        if not path.exists():
            log_event("[boxes] cache_miss", logger, file_id=file_id)
            return {"boxes": [], "meta": None, "cached": False}
        try:
            data = json.loads(path.read_text())
        except Exception as exc:
            logger.exception("[boxes] cache_read_failed", extra={"file_id": file_id})
            raise HTTPException(status_code=500, detail=f"Cache read failed: {exc}") from exc
        boxes = data.get("boxes", [])
        meta = data.get("meta")
        log_event("[boxes] cache_hit", logger, file_id=file_id, count=len(boxes))
        return {"boxes": boxes, "meta": meta, "cached": True, "saved_at": data.get("saved_at")}

    @app.post("/api/boxes")
    async def set_cached_boxes(payload: dict = Body(...)):
        file_id = payload.get("file_id")
        boxes = payload.get("boxes", [])
        if not file_id:
            raise HTTPException(status_code=400, detail="file_id is required")
        try:
            save_boxes_cache(file_id, boxes, logger, payload.get("meta"))
        except Exception as exc:
            logger.exception("[boxes] cache_write_failed", extra={"file_id": file_id})
            raise HTTPException(status_code=500, detail=f"Cache write failed: {exc}") from exc
        log_event("[boxes] cache_updated", logger, file_id=file_id, count=len(boxes))
        return {"saved": True, "count": len(boxes)}

    @app.post("/api/ocr")
    async def ocr(
        file_id: str = Form(...),
        boxes: str = Form(...),  # JSON string list of boxes with normalized coords
        lang: Optional[str] = Form("ja"),
        routing: Optional[str] = Form(None),  # JSON string mapping type->model_id
        one_page_mode: bool = Form(True),
    ):
        """OCR via manga-ocr (comic-translate) or PaddleOCR-VL-For-Manga."""
        log_event("[ocr] request", logger, file_id=file_id, lang=lang, one_page_mode=one_page_mode)
        image_path = resolve_image_path(file_id)
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        img = ensure_image(image_path, logger)
        resized, meta = resize_for_model(img)

        try:
            box_list = json.loads(boxes)
            log_event("[ocr] boxes_parsed", logger, count=len(box_list))
        except json.JSONDecodeError:
            logger.exception("[ocr] invalid boxes payload")
            raise HTTPException(status_code=400, detail="Invalid boxes payload")
        if not isinstance(box_list, list):
            raise HTTPException(status_code=400, detail="boxes must be a JSON list")

        try:
            routing_map = json.loads(routing) if routing else {}
        except json.JSONDecodeError:
            routing_map = {}
        log_event("[ocr] routing", logger, routing=routing_map)

        device = resolve_ocr_device()
        default_model = "manga-ocr" if (lang or "").lower() == "ja" else "paddleocr-vl"

        results = {}
        total_boxes = len(box_list)
        processed = 0
        started = time.perf_counter()
        for b in box_list:
            box_id = b.get("id") or uuid.uuid4().hex
            box_type = b.get("type")
            model_id = routing_map.get(box_type)
            if not model_id:
                model_id = "paddleocr-vl" if box_type == "sounds" else default_model
            crop, crop_coords = crop_box(resized, b)
            if crop is None:
                log_event("[ocr] invalid_box", logger, box_id=box_id, box=b)
                results[box_id] = ""
                continue
            try:
                box_start = time.perf_counter()
                if model_id == "manga-ocr":
                    text = run_manga_ocr(crop, device, logger)
                elif model_id == "paddleocr-vl":
                    text = run_paddleocr_vl(crop, device, lang, logger)
                else:
                    raise HTTPException(status_code=400, detail=f"Unknown OCR model: {model_id}")
                results[box_id] = text
                processed += 1
                elapsed = time.perf_counter() - started
                box_ms = int((time.perf_counter() - box_start) * 1000)
                avg_ms = (elapsed / processed) * 1000 if processed else 0
                remaining = max(0, total_boxes - processed)
                eta_ms = int((avg_ms * remaining)) if processed else 0
                log_event(
                    "[ocr] box_done",
                    logger,
                    box_id=box_id,
                    model=model_id,
                    crop=crop_coords,
                    chars=len(text),
                    crop_size=(crop.width, crop.height),
                    duration_ms=box_ms,
                    progress=f"{processed}/{total_boxes}",
                    eta_ms=eta_ms,
                )
            except HTTPException:
                raise
            except Exception as exc:
                logger.exception("[ocr] box_failed", extra={"box_id": box_id, "model": model_id})
                results[box_id] = ""

        response = {"results": results, "meta": meta, "lang": lang, "one_page_mode": one_page_mode}
        log_event("[ocr] response", logger, file_id=file_id, results=len(results))
        return response

    @app.post("/api/translate")
    async def translate(
        texts: str = Form(...),  # JSON string list of texts to translate
        source_lang: Optional[str] = Form("ja"),
        target_lang: Optional[str] = Form("en"),
        api_key: str = Form(...),  # Ollama Cloud API key
        model: Optional[str] = Form("llama3"),
    ):
        """Translate texts via Ollama Cloud API."""
        log_event("[translate] request", logger, source_lang=source_lang, target_lang=target_lang, model=model)
        
        try:
            text_list = json.loads(texts)
            log_event("[translate] texts_parsed", logger, count=len(text_list))
        except json.JSONDecodeError:
            logger.exception("[translate] invalid texts payload")
            raise HTTPException(status_code=400, detail="Invalid texts payload")
        if not isinstance(text_list, list):
            raise HTTPException(status_code=400, detail="texts must be a JSON list")
        
        try:
            results = translate_texts(text_list, source_lang, target_lang, api_key, model, logger)
        except HTTPException:
            raise
        
        response_data = {"results": results, "source_lang": source_lang, "target_lang": target_lang, "model": model}
        log_event("[translate] response", logger, results_count=len(results))
        return response_data

    @app.post("/api/ocr/stream")
    async def ocr_stream(
        file_id: str = Form(...),
        boxes: str = Form(...),
        lang: Optional[str] = Form("ja"),
        routing: Optional[str] = Form(None),
    ):
        """Streaming OCR - yields JSON lines as each box is processed."""
        log_event("[ocr-stream] request", logger, file_id=file_id, lang=lang)
        
        image_path = resolve_image_path(file_id)
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        try:
            box_list = json.loads(boxes)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid boxes payload")
        
        try:
            routing_map = json.loads(routing) if routing else {}
        except json.JSONDecodeError:
            routing_map = {}
        
        async def generate():
            img = ensure_image(image_path, logger)
            resized, meta = resize_for_model(img)
            device = resolve_ocr_device()
            default_model = "manga-ocr" if (lang or "").lower() == "ja" else "paddleocr-vl"
            total_boxes = len(box_list)
            processed = 0
            started = time.perf_counter()
            
            for b in box_list:
                box_id = b.get("id") or uuid.uuid4().hex
                box_type = b.get("type")
                model_id = routing_map.get(box_type)
                if not model_id:
                    model_id = "paddleocr-vl" if box_type == "sounds" else default_model
                crop, crop_coords = crop_box(resized, b)
                
                if crop is None:
                    result = {"box_id": box_id, "text": "", "status": "error", "error": "invalid_box"}
                else:
                    try:
                        box_start = time.perf_counter()
                        if model_id == "manga-ocr":
                            text = run_manga_ocr(crop, device, logger)
                        elif model_id == "paddleocr-vl":
                            text = run_paddleocr_vl(crop, device, lang, logger)
                        else:
                            text = ""
                        result = {"box_id": box_id, "text": text, "status": "done"}
                        processed += 1
                        elapsed = time.perf_counter() - started
                        box_ms = int((time.perf_counter() - box_start) * 1000)
                        avg_ms = (elapsed / processed) * 1000 if processed else 0
                        remaining = max(0, total_boxes - processed)
                        eta_ms = int((avg_ms * remaining)) if processed else 0
                        log_event(
                            "[ocr-stream] box_done",
                            logger,
                            box_id=box_id,
                            chars=len(text),
                            crop=crop_coords,
                            crop_size=(crop.width, crop.height),
                            duration_ms=box_ms,
                            progress=f"{processed}/{total_boxes}",
                            eta_ms=eta_ms,
                        )
                    except Exception as exc:
                        logger.exception("[ocr-stream] box_failed", extra={"box_id": box_id})
                        result = {"box_id": box_id, "text": "", "status": "error", "error": str(exc)}
                
                yield f"data: {json.dumps(result)}\n\n"
            
            yield f"data: {json.dumps({'status': 'complete', 'total': len(box_list)})}\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    @app.post("/api/translate/stream")
    async def translate_stream(
        texts: str = Form(...),
        box_ids: str = Form(...),  # JSON array of box IDs corresponding to texts
        source_lang: Optional[str] = Form("ja"),
        target_lang: Optional[str] = Form("en"),
        api_key: str = Form(...),
        model: Optional[str] = Form("llama3"),
    ):
        """Streaming translation - yields JSON lines as each text is translated."""
        log_event("[translate-stream] request", logger, source_lang=source_lang, target_lang=target_lang, model=model)
        
        try:
            text_list = json.loads(texts)
            box_id_list = json.loads(box_ids)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")
        
        if len(text_list) != len(box_id_list):
            raise HTTPException(status_code=400, detail="texts and box_ids must have same length")
        
        async def generate():
            for idx, (text, box_id) in enumerate(zip(text_list, box_id_list)):
                if not text or not isinstance(text, str) or not text.strip():
                    yield f"data: {json.dumps({'box_id': box_id, 'text': '', 'status': 'done'})}\n\n"
                    continue
                
                try:
                    translated_text = translate_text_stream(text, source_lang, target_lang, api_key, model, logger)
                    result = {"box_id": box_id, "text": translated_text, "status": "done", "index": idx}
                    log_event("[translate-stream] done", logger, box_id=box_id, chars=len(translated_text))
                except Exception as exc:
                    logger.exception("[translate-stream] failed", extra={"box_id": box_id})
                    result = {"box_id": box_id, "text": "", "status": "error", "error": str(exc), "index": idx}
                
                yield f"data: {json.dumps(result)}\n\n"
            
            yield f"data: {json.dumps({'status': 'complete', 'total': len(text_list)})}\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    @app.post("/api/cleanup")
    async def cleanup(file_ids: Optional[str] = Form(None)):
        """Cleanup tmp files. If file_ids provided (comma-separated), delete only those; otherwise purge tmp."""
        log_event("[cleanup] request", logger, file_ids=file_ids)
        if file_ids:
            ids = {fid.strip() for fid in file_ids.split(",") if fid.strip()}
            removed = []
            for fid in ids:
                for p in TMP_DIR.glob(f"{fid}*"):
                    try:
                        p.unlink()
                        removed.append(p.name)
                    except FileNotFoundError:
                        continue
            log_event("[cleanup] response", logger, removed=removed)
            return {"removed": removed}
        else:
            removed = []
            for p in TMP_DIR.glob("*"):
                try:
                    p.unlink()
                    removed.append(p.name)
                except FileNotFoundError:
                    continue
            log_event("[cleanup] response_all", logger, removed=removed)
            return {"removed": removed}
