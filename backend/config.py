"""
Configuration constants and paths.
"""
import sys
from pathlib import Path

# Base paths
ROOT_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = ROOT_DIR / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)
THIRD_PARTY_DIR = ROOT_DIR / "third_party"
DETECTOR_DIR = THIRD_PARTY_DIR / "comic-text-and-bubble-detector"
COMIC_TRANSLATE_DIR = THIRD_PARTY_DIR / "comic-translate"
PADDLE_OCR_VL_DIR = THIRD_PARTY_DIR / "paddleocr-vl-for-manga"
LOG_DIR = ROOT_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "backend.log"

# Add comic-translate to Python path
if str(COMIC_TRANSLATE_DIR) not in sys.path:
    sys.path.insert(0, str(COMIC_TRANSLATE_DIR))

# Image file extensions
IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".gif",
}

# Optional archive libraries
try:
    import py7zr
    HAS_7Z = True
except ImportError:
    HAS_7Z = False

try:
    import rarfile
    HAS_RAR = True
except ImportError:
    HAS_RAR = False

# OCR settings
OCR_CROP_PAD_RATIO = 0.05

