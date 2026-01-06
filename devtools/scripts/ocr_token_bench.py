#!/usr/bin/env python3
"""
Run manga-ocr on detected boxes and log token statistics.
Writes per-box JSONL and summary/token frequency JSON.
"""
import argparse
import json
import logging
from pathlib import Path

import numpy as np
import torch
from PIL import Image


def _ensure_backend_on_path():
    backend_dir = Path(__file__).resolve().parents[1]
    if str(backend_dir) not in __import__("sys").path:
        __import__("sys").path.insert(0, str(backend_dir))


def _convert_ids_to_tokens(tokenizer, token_ids):
    try:
        return tokenizer.convert_ids_to_tokens(token_ids, skip_special_tokens=False)
    except TypeError:
        return tokenizer.convert_ids_to_tokens(token_ids)


def _iter_boxes_files(input_dir: Path):
    for path in sorted(input_dir.glob("*.boxes.json")):
        if path.is_file():
            yield path


def main():
    parser = argparse.ArgumentParser(description="MangaOCR token statistics")
    parser.add_argument(
        "--input-dir",
        default="tmp",
        help="Directory with images + boxes JSON (default: tmp)",
    )
    parser.add_argument(
        "--out-dir",
        default="logs/ocr_tokens",
        help="Directory to write logs (default: logs/ocr_tokens)",
    )
    parser.add_argument(
        "--device",
        default="cpu",
        help="Device for OCR (default: cpu)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional limit on number of images (0 = no limit)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger = logging.getLogger("ocr_token_bench")

    _ensure_backend_on_path()
    from models.manga_ocr import load_manga_ocr  # noqa: E402
    from modules.ocr.manga_ocr.engine import post_process  # noqa: E402
    from utils.image import crop_box, ensure_image, resolve_image_path, resize_for_model  # noqa: E402

    input_dir = Path(args.input_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results_path = out_dir / "runs.jsonl"
    summary_path = out_dir / "summary.json"
    token_counts_path = out_dir / "token_counts.json"

    if not input_dir.exists():
        raise SystemExit(f"Input dir not found: {input_dir}")

    logger.info("loading manga-ocr model")
    model = load_manga_ocr(torch.device(args.device), logger)

    special_ids = set(getattr(model.tokenizer, "all_special_ids", []))
    token_counts = {}
    total_tokens = 0
    total_tokens_no_special = 0
    total_images = 0

    with results_path.open("w", encoding="utf-8") as out_f:
        box_files = list(_iter_boxes_files(input_dir))
        if not box_files:
            logger.warning("no *.boxes.json found in %s", input_dir)
        processed_boxes = 0
        for box_file in box_files:
            try:
                payload = json.loads(box_file.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning("failed to read %s: %s", box_file, exc)
                continue
            file_id = payload.get("file_id") or box_file.stem.replace(".boxes", "")
            boxes = payload.get("boxes") or []
            if not isinstance(boxes, list):
                logger.warning("invalid boxes list in %s", box_file)
                continue
            image_path = resolve_image_path(file_id)
            if not image_path.exists():
                logger.warning("image not found for %s", file_id)
                continue
            img = ensure_image(image_path, logger)
            resized, meta = resize_for_model(img)

            for b in boxes:
                if args.limit and processed_boxes >= args.limit:
                    break
                crop, crop_coords = crop_box(resized, b)
                if crop is None:
                    continue
                np_img = np.array(crop)
                pixel_values = model.processor(np_img, return_tensors="pt").pixel_values.squeeze()
                with torch.no_grad():
                    token_ids = (
                        model.model.generate(pixel_values[None].to(model.model.device))[0]
                        .cpu()
                        .tolist()
                    )

                tokens = _convert_ids_to_tokens(model.tokenizer, token_ids)
                text = post_process(model.tokenizer.decode(token_ids, skip_special_tokens=True))

                special_count = sum(1 for tid in token_ids if tid in special_ids)
                token_count = len(token_ids)
                token_count_no_special = token_count - special_count

                total_images += 1
                total_tokens += token_count
                total_tokens_no_special += token_count_no_special

                for tok in tokens:
                    token_counts[tok] = token_counts.get(tok, 0) + 1

                record = {
                    "file_id": file_id,
                    "image": str(image_path),
                    "box_id": b.get("id"),
                    "box_type": b.get("type"),
                    "box_score": b.get("score"),
                    "box": {"x": b.get("x"), "y": b.get("y"), "w": b.get("w"), "h": b.get("h")},
                    "crop_coords": crop_coords,
                    "crop_size": [crop.width, crop.height],
                    "resized_size": list(resized.size),
                    "orig_size": list(meta.get("orig_size", resized.size)),
                    "token_count": token_count,
                    "token_count_no_special": token_count_no_special,
                    "special_count": special_count,
                    "tokens": tokens,
                    "token_ids": token_ids,
                    "text": text,
                }
                out_f.write(json.dumps(record, ensure_ascii=True) + "\n")
                processed_boxes += 1
                logger.info("processed %s box=%s tokens=%d", file_id, b.get("id"), token_count)
            if args.limit and processed_boxes >= args.limit:
                break

    summary = {
        "boxes": total_images,
        "avg_tokens": (total_tokens / total_images) if total_images else 0,
        "avg_tokens_no_special": (total_tokens_no_special / total_images) if total_images else 0,
        "total_tokens": total_tokens,
        "total_tokens_no_special": total_tokens_no_special,
    }

    with summary_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=True, indent=2)
    with token_counts_path.open("w", encoding="utf-8") as f:
        json.dump(token_counts, f, ensure_ascii=True, indent=2)

    logger.info("done: boxes=%d avg_tokens=%.2f", total_images, summary["avg_tokens"])
    logger.info("wrote %s", results_path)
    logger.info("wrote %s", summary_path)
    logger.info("wrote %s", token_counts_path)


if __name__ == "__main__":
    main()
