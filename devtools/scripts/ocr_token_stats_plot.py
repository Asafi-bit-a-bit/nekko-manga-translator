#!/usr/bin/env python3
"""
Create stats and plots from runs.jsonl produced by ocr_token_bench.py.
Outputs stats.json and plot.png.
"""
import argparse
import json
from pathlib import Path
from statistics import mean, median


def _load_runs(path: Path):
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return rows


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _compute_stats(values):
    if not values:
        return {
            "count": 0,
            "min": 0,
            "max": 0,
            "mean": 0,
            "median": 0,
        }
    return {
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "mean": mean(values),
        "median": median(values),
    }


def main():
    parser = argparse.ArgumentParser(description="Plot OCR token statistics")
    parser.add_argument(
        "--input",
        default="logs/ocr_tokens/runs.jsonl",
        help="Path to runs.jsonl",
    )
    parser.add_argument(
        "--out-dir",
        default="logs/ocr_tokens",
        help="Output directory",
    )
    args = parser.parse_args()

    runs_path = Path(args.input)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stats_path = out_dir / "stats.json"
    plot_path = out_dir / "token_stats.png"

    rows = _load_runs(runs_path)
    token_counts = [int(r.get("token_count_no_special", r.get("token_count", 0))) for r in rows]

    areas = []
    for r in rows:
        crop_size = r.get("crop_size") or [0, 0]
        w = _safe_float(crop_size[0])
        h = _safe_float(crop_size[1])
        areas.append(w * h)

    stats = {
        "token_count_no_special": _compute_stats(token_counts),
        "crop_area_px": _compute_stats(areas),
    }

    with stats_path.open("w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=True, indent=2)

    try:
        import matplotlib.pyplot as plt
    except Exception:
        print("matplotlib is required to generate plots. Install with: pip install matplotlib")
        return

    fig = plt.figure(figsize=(12, 8))

    # Histogram of token counts
    ax1 = fig.add_subplot(2, 2, 1)
    ax1.hist(token_counts, bins=30, color="#4C78A8", alpha=0.85)
    ax1.set_title("Token count (no special) histogram")
    ax1.set_xlabel("tokens")
    ax1.set_ylabel("boxes")

    # Scatter: tokens vs crop area
    ax2 = fig.add_subplot(2, 2, 2)
    ax2.scatter(areas, token_counts, s=10, alpha=0.5, color="#F58518")
    ax2.set_title("Token count vs crop area")
    ax2.set_xlabel("crop area (px^2)")
    ax2.set_ylabel("tokens (no special)")

    # Box plot
    ax3 = fig.add_subplot(2, 2, 3)
    ax3.boxplot(token_counts, vert=True, showfliers=True)
    ax3.set_title("Token count distribution")
    ax3.set_ylabel("tokens (no special)")

    # Text stats
    ax4 = fig.add_subplot(2, 2, 4)
    ax4.axis("off")
    s = stats["token_count_no_special"]
    text = (
        f"Count: {s['count']}\n"
        f"Min: {s['min']}\n"
        f"Max: {s['max']}\n"
        f"Mean: {s['mean']:.2f}\n"
        f"Median: {s['median']:.2f}\n"
    )
    ax4.text(0.05, 0.95, text, va="top", fontsize=12)

    fig.tight_layout()
    fig.savefig(plot_path, dpi=150)
    print(f"Wrote {stats_path}")
    print(f"Wrote {plot_path}")


if __name__ == "__main__":
    main()
