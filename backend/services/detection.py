"""
Detection service.
"""
import time
import uuid
import torch
from transformers.utils import ModelOutput

from models.detector import load_detector
from utils.boxes import normalize_boxes, save_boxes_cache, suppress_overlaps
from utils.image import ensure_image, resize_for_model
from logging_config import log_event


def to_cpu_tree(value):
    """Recursively move tensors to CPU."""
    if torch.is_tensor(value):
        return value.to("cpu")
    if isinstance(value, ModelOutput):
        data = {k: to_cpu_tree(v) for k, v in value.items()}
        return value.__class__(**data)
    if isinstance(value, dict):
        return {k: to_cpu_tree(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        converted = [to_cpu_tree(v) for v in value]
        return tuple(converted) if isinstance(value, tuple) else converted
    return value


def run_detection(file_id: str, image_path, max_boxes: int, threshold: float, logger):
    """Run detection on image and return boxes."""
    request_started = time.perf_counter()
    log_event(
        "[detect] request",
        logger,
        file_id=file_id,
        max_boxes=int(max_boxes),
        threshold=float(threshold),
    )

    img = ensure_image(image_path, logger)
    resized, meta = resize_for_model(img)

    try:
        det_model, det_processor = load_detector(logger)
    except Exception as exc:
        logger.exception("[detect] load_detector failed")
        raise RuntimeError(f"Detector not available: {exc}") from exc

    try:
        prep_started = time.perf_counter()
        inputs = det_processor(images=resized, return_tensors="pt")
        log_event(
            "[detect] prepared_inputs",
            logger,
            keys=list(inputs.keys()),
            resized_size=resized.size,
            orig_size=meta.get("orig_size"),
        )
        device = next(det_model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.no_grad():
            outputs = det_model(**inputs)
        log_event("[detect] outputs_type", logger, type=type(outputs).__name__)
        inference_ms = int((time.perf_counter() - prep_started) * 1000)
        log_event("[detect] inference_complete", logger, duration_ms=inference_ms)
        outputs = to_cpu_tree(outputs)
        target_sizes = torch.tensor([[resized.height, resized.width]], dtype=torch.int64)
        post_processed = det_processor.post_process_object_detection(
            outputs, threshold=0.001, target_sizes=target_sizes
        )
        results = post_processed[0] if post_processed else None

        if results is None:
            log_event("[detect] no_results", logger, reason="post_process_empty", meta=meta)
            return {
                "boxes": [],
                "meta": meta,
            }

        boxes = []
        allowed_types = {"text_bubble"}
        try:
            min_score = float(threshold)
        except Exception:
            min_score = 0.66
        min_score = max(0.0, min(0.99, min_score))

        # Handle case when no detections are found
        if "scores" not in results or len(results["scores"]) == 0:
            log_event("[detect] no_results", logger, reason="scores_empty", meta=meta)
            return {
                "boxes": [],
                "meta": meta,
            }

        for score, _label_id, box in zip(results["scores"], results["labels"], results["boxes"]):
            mapped_label = "text_bubble"
            score_val = float(score.item())
            if score_val < min_score:
                continue
            if mapped_label not in allowed_types:
                continue
            boxes.append(
                {
                    "id": uuid.uuid4().hex,
                    "type": mapped_label,
                    "score": score_val,
                    "x": float(box[0].item()),
                    "y": float(box[1].item()),
                    "w": float(box[2].item() - box[0].item()),
                    "h": float(box[3].item() - box[1].item()),
                }
            )

        before_suppress = len(boxes)
        boxes = suppress_overlaps(boxes, int(max_boxes))
        log_event(
            "[detect] filtered_boxes",
            logger,
            allowed_types=sorted(allowed_types),
            min_score=min_score,
            before=before_suppress,
            after=len(boxes),
        )
        boxes = normalize_boxes(boxes, (resized.width, resized.height))
        try:
            save_boxes_cache(file_id, boxes, logger, meta)
        except Exception:
            logger.exception("[detect] cache_save_failed", extra={"file_id": file_id})
        log_event(
            "[detect] boxes_ready",
            logger,
            total=len(boxes),
            top_scores=[round(b["score"], 4) for b in boxes[:5]],
            meta=meta,
        )

        response = {
            "boxes": boxes[: int(max_boxes)],
            "meta": meta,
        }
        total_ms = int((time.perf_counter() - request_started) * 1000)
        log_event("[detect] response", logger, file_id=file_id, box_count=len(response["boxes"]), duration_ms=total_ms)
        return response
    except Exception as exc:
        import traceback
        error_detail = f"Detection error: {str(exc)}\n{traceback.format_exc()}"
        logger.exception("[detect] error processing file_id=%s", file_id)
        raise RuntimeError(f"Detection failed: {str(exc)}") from exc

