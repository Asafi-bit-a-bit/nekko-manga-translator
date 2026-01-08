#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
WEB_DIR="$ROOT_DIR/web-ui"
THIRD_PARTY_DIR="$ROOT_DIR/third_party"
WHEELS_DIR="$ROOT_DIR/wheels"
TMP_DIR="$ROOT_DIR/tmp"
PADDLE_OCR_VL_DIR="$THIRD_PARTY_DIR/paddleocr-vl-for-manga"
PADDLE_OCR_VL_REPO="https://huggingface.co/jzhang533/PaddleOCR-VL-For-Manga"

REQ_BASE="$BACKEND_DIR/requirements-base.txt"
REQ_FULL="$BACKEND_DIR/requirements.txt"
DEPS_BASE_MARKER="$BACKEND_DIR/.venv/.deps_base_installed"
DEPS_FULL_MARKER="$BACKEND_DIR/.venv/.deps_full_installed"
CUDA_WHEELS_MARKER="$BACKEND_DIR/.venv/.cuda_wheels_installed"
FIRST_FIX_MARKER="$BACKEND_DIR/.venv/.first_fix_done"

PYTORCH_CUDA_INDEX_URL="https://download.pytorch.org/whl/cu124"

export PADDLE_OCR_DEVICE=cuda

# ======================================================
# Launch configuration (editable via configure_launch.py)
# ======================================================
WEBUI_AUTO_MODE="${WEBUI_AUTO_MODE:-auto_fix}"
WEBUI_SHOW_PROGRESS="${WEBUI_SHOW_PROGRESS:-1}"

log() {
  echo "[webui] $*"
}

run_preflight() {
  local preflight_py="$BACKEND_DIR/tests/preflight.py"
  PREFLIGHT_RC=0
  if [ ! -f "$preflight_py" ]; then
    log "Preflight not found, skipping"
    return 0
  fi

  local effective_mode="$WEBUI_AUTO_MODE"
  if [ "$WEBUI_AUTO_MODE" = "auto_fix" ] && [ -f "$FIRST_FIX_MARKER" ]; then
    effective_mode="verify_first"
  fi

  if [ "$effective_mode" = "auto_fix" ]; then
    log "Running preflight with auto-fix"
    WEBUI_SHOW_PROGRESS="$WEBUI_SHOW_PROGRESS" "$BACKEND_DIR/.venv/bin/python" "$preflight_py" --fix || PREFLIGHT_RC=$?
    if [ "$PREFLIGHT_RC" -eq 0 ]; then
      touch "$FIRST_FIX_MARKER"
      WEBUI_AUTO_MODE="verify_first"
    fi
  else
    log "Running preflight (verify then fix if needed)"
    WEBUI_SHOW_PROGRESS="$WEBUI_SHOW_PROGRESS" "$BACKEND_DIR/.venv/bin/python" "$preflight_py" || PREFLIGHT_RC=$?
    if [ "$PREFLIGHT_RC" -ne 0 ]; then
      log "Verification failed, running auto-fix"
      PREFLIGHT_RC=0
      WEBUI_SHOW_PROGRESS="$WEBUI_SHOW_PROGRESS" "$BACKEND_DIR/.venv/bin/python" "$preflight_py" --fix || PREFLIGHT_RC=$?
      if [ "$PREFLIGHT_RC" -eq 0 ]; then
        touch "$FIRST_FIX_MARKER"
      fi
    fi
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

require_node_version() {
  if ! have_cmd node; then
    echo "Missing required command: node"
    exit 1
  fi

  local os_name
  os_name="$(uname -s)"

  local ver raw major minor
  raw="$(node -p "process.versions.node" 2>/dev/null || node -v)"
  ver="${raw#v}"
  major="${ver%%.*}"
  minor="${ver#*.}"
  minor="${minor%%.*}"

  if [ "$major" -ge 22 ]; then
    return 0
  fi
  if [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; then
    return 0
  fi

  if [ "$os_name" = "Linux" ] && have_cmd sudo && have_cmd apt-get; then
    log "Node.js $ver detected. Installing Node.js 20.x via apt."
    sudo apt-get update
    if ! have_cmd curl; then
      sudo apt-get install -y curl
    fi
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    raw="$(node -p "process.versions.node" 2>/dev/null || node -v)"
    ver="${raw#v}"
    major="${ver%%.*}"
    minor="${ver#*.}"
    if [ "$major" -ge 22 ] || { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; }; then
      return 0
    fi
  elif [ "$os_name" = "Darwin" ]; then
    if have_cmd brew; then
      log "Node.js $ver detected. Installing Node.js 20 via Homebrew."
      brew update
      brew install node@20
      if brew list node@20 >/dev/null 2>&1; then
        brew link --overwrite --force node@20
      fi
    else
      log "Node.js $ver detected. Installing Node.js 20 via nvm."
      if ! have_cmd curl; then
        echo "curl is required to install nvm"
        exit 1
      fi
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
      export NVM_DIR="$HOME/.nvm"
      if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
      fi
      if command -v nvm >/dev/null 2>&1; then
        nvm install 20
        nvm use 20
      fi
    fi
    raw="$(node -p "process.versions.node" 2>/dev/null || node -v)"
    ver="${raw#v}"
    major="${ver%%.*}"
    minor="${ver#*.}"
    if [ "$major" -ge 22 ] || { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; }; then
      return 0
    fi
  fi

  echo "Node.js $ver detected. Vite requires Node.js 20.19+ or 22.12+."
  echo "Upgrade Node.js and re-run ./webui.sh"
  exit 1
}

install_deps_linux() {
  if ! have_cmd sudo; then
    echo "sudo not found; please install npm and git-lfs manually."
    return 1
  fi
  if have_cmd apt-get; then
    sudo apt-get update
    sudo apt-get install -y git-lfs nodejs npm
    return 0
  fi
  if have_cmd dnf; then
    sudo dnf install -y git-lfs nodejs npm
    return 0
  fi
  if have_cmd yum; then
    sudo yum install -y git-lfs nodejs npm
    return 0
  fi
  if have_cmd pacman; then
    sudo pacman -Sy --noconfirm git-lfs nodejs npm
    return 0
  fi
  if have_cmd zypper; then
    sudo zypper install -y git-lfs nodejs npm
    return 0
  fi
  echo "No supported package manager found; install npm and git-lfs manually."
  return 1
}

require_cmd git
if have_cmd python; then
  PYTHON_CMD="python"
elif have_cmd python3; then
  PYTHON_CMD="python3"
else
  echo "Missing required command: python or python3"
  exit 1
fi
if ! have_cmd npm || ! have_cmd git-lfs; then
  log "Installing missing system deps (npm, git-lfs)"
  install_deps_linux || true
fi
require_cmd npm
require_node_version

if ! git lfs version >/dev/null 2>&1; then
  echo "git-lfs is required to download model weights. Install it and re-run."
  exit 1
fi

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  log "Creating Python venv"
  "$PYTHON_CMD" -m venv "$BACKEND_DIR/.venv"
fi

if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
  log "Venv looks broken; recreating"
  rm -rf "$BACKEND_DIR/.venv"
  "$PYTHON_CMD" -m venv "$BACKEND_DIR/.venv"
fi

if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
  echo "Python not found in venv: $BACKEND_DIR/.venv/bin/python"
  exit 1
fi

source "$BACKEND_DIR/.venv/bin/activate"
PIP_FLAGS=(--disable-pip-version-check)

OS_NAME="$(uname -s)"
IS_MAC=0
if [ "$OS_NAME" = "Darwin" ]; then
  IS_MAC=1
fi

CUDA_AVAILABLE=0
if [ "$IS_MAC" -eq 0 ]; then
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
    CUDA_AVAILABLE=1
  fi
fi

install_base_deps() {
  if ! requirements_ok; then
    log "Installing Python dependencies (base)"
    pip install "${PIP_FLAGS[@]}" --upgrade pip
    pip install "${PIP_FLAGS[@]}" -r "$REQ_BASE"
    touch "$DEPS_BASE_MARKER"
  else
    log "Python dependencies already satisfied"
  fi
}

install_full_deps() {
  if ! requirements_ok; then
    log "Installing Python dependencies (full)"
    pip install "${PIP_FLAGS[@]}" --upgrade pip
    pip install "${PIP_FLAGS[@]}" -r "$REQ_FULL"
    touch "$DEPS_FULL_MARKER"
  else
    log "Python dependencies already satisfied"
  fi
}

requirements_ok() {
  python - <<PY
import sys
try:
    import pkg_resources
except Exception:
    sys.exit(2)
from pathlib import Path

req_file = Path(r"$REQ_FULL")
for raw in req_file.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or line.startswith("-e") or line.startswith("git+"):
        continue
    try:
        pkg_resources.require(line)
    except Exception:
        sys.exit(1)
sys.exit(0)
PY
  local rc=$?
  if [ "$rc" -eq 2 ]; then
    log "Installing setuptools for requirements check"
    pip install "${PIP_FLAGS[@]}" setuptools
    python - <<PY
import sys
import pkg_resources
from pathlib import Path

req_file = Path(r"$REQ_FULL")
for raw in req_file.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or line.startswith("-e") or line.startswith("git+"):
        continue
    try:
        pkg_resources.require(line)
    except Exception:
        sys.exit(1)
sys.exit(0)
PY
    return $?
  fi
  return "$rc"
}

torch_ok() {
  python - <<PY
import sys
try:
    import torch  # noqa: F401
except Exception:
    sys.exit(1)
sys.exit(0)
PY
}

ensure_cuda_wheels() {
  if [ -f "$CUDA_WHEELS_MARKER" ] && torch_ok; then
    log "CUDA wheels already installed"
    return 0
  fi

  log "Installing CUDA wheels from PyTorch index"
  pip install "${PIP_FLAGS[@]}" torch torchvision --index-url "$PYTORCH_CUDA_INDEX_URL"
  touch "$CUDA_WHEELS_MARKER"
}

if [ "$IS_MAC" -eq 1 ]; then
  install_full_deps
elif [ "$CUDA_AVAILABLE" -eq 1 ]; then
  install_base_deps
  ensure_cuda_wheels
else
  install_full_deps
fi

if ! torch_ok; then
  if [ "$CUDA_AVAILABLE" -eq 1 ]; then
    log "torch missing after CUDA wheels; reinstalling CUDA wheels"
    rm -f "$CUDA_WHEELS_MARKER"
    ensure_cuda_wheels
  else
    log "Installing torch (CPU)"
    pip install "${PIP_FLAGS[@]}" torch
  fi
fi

mkdir -p "$THIRD_PARTY_DIR"
git lfs install --local >/dev/null 2>&1 || true

clone_repo() {
  local url="$1"
  local dest="$2"
  if [ -d "$dest/.git" ]; then
    :
  elif [ -d "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
    log "Repo already present at $dest"
  else
    log "Cloning $url"
    git clone "$url" "$dest"
  fi
}

ensure_paddleocr_vl_repo() {
  local config_path="$PADDLE_OCR_VL_DIR/config.json"
  if [ -f "$config_path" ] && grep -q '"model_type"' "$config_path" && grep -q 'paddleocr_vl' "$config_path"; then
    return 0
  fi

  if [ -d "$PADDLE_OCR_VL_DIR" ]; then
    local backup="${PADDLE_OCR_VL_DIR}.bak.$(date +%s)"
    log "Backing up invalid PaddleOCR-VL repo to $backup"
    mv "$PADDLE_OCR_VL_DIR" "$backup"
  fi
  clone_repo "$PADDLE_OCR_VL_REPO" "$PADDLE_OCR_VL_DIR"
}

clone_repo "https://huggingface.co/ogkalu/comic-text-and-bubble-detector" \
  "$THIRD_PARTY_DIR/comic-text-and-bubble-detector"
ensure_paddleocr_vl_repo
clone_repo "https://github.com/ogkalu2/comic-translate" \
  "$THIRD_PARTY_DIR/comic-translate"
clone_repo "https://github.com/kha-white/manga-ocr.git" \
  "$THIRD_PARTY_DIR/manga-ocr"

for repo in \
  "$THIRD_PARTY_DIR/comic-text-and-bubble-detector" \
  "$PADDLE_OCR_VL_DIR"
do
  if [ -d "$repo/.git" ]; then
    if (cd "$repo" && git lfs ls-files 2>/dev/null | grep -q "pointer" 2>/dev/null); then
      log "Pulling LFS weights in $repo"
      (cd "$repo" && git lfs pull >/dev/null 2>&1 || true)
    fi
  fi
done

MANGA_OCR_MARKER="$THIRD_PARTY_DIR/manga-ocr/.weights_ready"
if [ ! -d "$THIRD_PARTY_DIR/manga-ocr" ]; then
  log "manga-ocr repo missing. Retry clone or check VPN."
elif [ ! -f "$MANGA_OCR_MARKER" ]; then
  log "Preloading manga-ocr weights"
  python - <<PY
import sys
from pathlib import Path

repo = Path("${THIRD_PARTY_DIR}") / "manga-ocr"
sys.path.insert(0, str(repo))

from manga_ocr import MangaOcr  # noqa: E402

MangaOcr()
PY
  touch "$MANGA_OCR_MARKER"
else
  log "manga-ocr weights already present"
fi

cd "$WEB_DIR"
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
  log "Installing frontend dependencies"
  npm install
fi

COMIC_TRANSLATE_MANGA_OCR_BIN="$THIRD_PARTY_DIR/comic-translate/models/ocr/manga-ocr-base/pytorch_model.bin"
if [ -d "$THIRD_PARTY_DIR/comic-translate" ] && [ ! -f "$COMIC_TRANSLATE_MANGA_OCR_BIN" ]; then
  log "Downloading comic-translate manga-ocr weights"
  if [ -f "$THIRD_PARTY_DIR/comic-translate/modules/utils/download.py" ]; then
    if ! "$BACKEND_DIR/.venv/bin/python" - <<PY
import importlib.util
from pathlib import Path

download_py = Path(r"$THIRD_PARTY_DIR/comic-translate/modules/utils/download.py")
spec = importlib.util.spec_from_file_location("ct_download", download_py)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.ModelDownloader.get(mod.ModelID.MANGA_OCR_BASE)
PY
    then
      log "Failed to download comic-translate manga-ocr weights"
    fi
  else
    log "comic-translate download helper not found"
  fi
fi

run_preflight

if [ "${PREFLIGHT_RC:-0}" -ne 0 ]; then
  log "Preflight failed after auto-fix. Fix issues above and re-run."
  exit 1
fi

rm -rf "$TMP_DIR" && mkdir -p "$TMP_DIR"

cd "$BACKEND_DIR"
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

cd "$WEB_DIR"
npm run dev -- --host 0.0.0.0 --port 5173 &
FRONT_PID=$!

trap 'kill $BACKEND_PID $FRONT_PID 2>/dev/null || true' EXIT

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONT_PID"
echo "Press Ctrl+C to stop."

wait
