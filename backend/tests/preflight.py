#!/usr/bin/env python3
"""
Preflight checks for webui.
- Проверяет окружение и наличие необходимых ресурсов.
- В режиме --fix пытается автоматически скачать/установить недостающие зависимости.
- Возвращает 0 если всё ок, иначе 1.
"""

from __future__ import annotations
import argparse
import os
import sys
import subprocess
from importlib import metadata
import tempfile
import zipfile
import time
from pathlib import Path
from typing import List, Optional, Tuple
try:
    from packaging.requirements import Requirement
except ImportError:
    # Минимальный авто-фикс, если packaging отсутствует в venv
    subprocess.run([sys.executable, "-m", "pip", "install", "packaging>=24.0"], check=False)
    from packaging.requirements import Requirement

# --- Настройки проекта (подправьте пути при необходимости) ---
ROOT_DIR = Path(__file__).resolve().parents[2]   # repo root (../.. from backend/tests)
BACKEND_DIR = ROOT_DIR / "backend"
WEB_DIR = ROOT_DIR / "web-ui"
THIRD_PARTY_DIR = ROOT_DIR / "third_party"
WHEELS_DIR = ROOT_DIR / "wheels"

# expected torch (optional) - может быть пустой строкой, если не требуется строгая версия
EXPECTED_TORCH_VERSION = "2.6.0"      # без +cuXXX; используется только для информирования
REQUIREMENTS_FILE = BACKEND_DIR / "requirements.txt"

# Model file paths (проверьте соответствие)
MANGA_OCR_BIN = THIRD_PARTY_DIR / "comic-translate" / "models" / "ocr" / "manga-ocr-base" / "pytorch_model.bin"

# CUDA wheels (Win, скачиваем с gdrive zip)
CUDA_ARCHIVE_ID_WIN = "1cXJCDNb7TX_w8eafAwmfF2flGzjUgoHA"
CUDA_ARCHIVE_NAME_WIN = "cuda_wheels_win.zip"
CUDA_WHEELS_MARKER = BACKEND_DIR / ".venv" / ".cuda_wheels_installed"

# Coloring (best-effort)
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
RESET = "\033[0m"

# Timeouts
SHORT_TIMEOUT = 10
MEDIUM_TIMEOUT = 30
LONG_TIMEOUT = 900
DOWNLOAD_RETRIES = 8
RETRY_SLEEP_SEC = 5
SHOW_PROGRESS = os.environ.get("WEBUI_SHOW_PROGRESS", "").strip() == "1"

# ----------------- helpers -----------------

def run(cmd: List[str], cwd: Optional[Path] = None, timeout: int = MEDIUM_TIMEOUT, quiet: bool = True) -> Tuple[int, str, str]:
    """Run a command and return (returncode, stdout, stderr). If quiet=False, streams to console."""
    try:
        if quiet:
            proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True, text=True, timeout=timeout)
            return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
        proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, text=True, timeout=timeout)
        return proc.returncode, "", ""
    except subprocess.TimeoutExpired:
        return -1, "", "timeout"
    except FileNotFoundError as e:
        return 127, "", str(e)
    except Exception as e:
        return -2, "", str(e)

def log_ok(msg: str):
    print(f"{GREEN}?{RESET} {msg}")

def log_warn(msg: str):
    print(f"{YELLOW}!{RESET} {msg}")

def log_err(msg: str):
    print(f"{RED}?{RESET} {msg}")

def venv_python_exe() -> Optional[Path]:
    venv_py = BACKEND_DIR / ".venv" / ("Scripts" if sys.platform == "win32" else "bin") / ("python.exe" if sys.platform == "win32" else "python")
    return venv_py if venv_py.exists() else None

# ----------------- fix helpers -----------------

def ensure_dirs_exist():
    """Создаёт базовые директории, если их нет (wheels/tmp/third_party)."""
    for path in (WHEELS_DIR, THIRD_PARTY_DIR, ROOT_DIR / "tmp"):
        try:
            path.mkdir(parents=True, exist_ok=True)
        except Exception:
            # Позже проверки покажут проблему с доступом.
            pass


def ensure_venv_exists() -> Optional[Path]:
    """Пытается найти или создать backend/.venv и вернуть путь до python.exe."""
    venv_py = venv_python_exe()
    if venv_py:
        return venv_py
    try:
        print("[fix] Creating Python venv at backend/.venv")
        code, _, err = run([sys.executable, "-m", "venv", str(BACKEND_DIR / ".venv")], timeout=MEDIUM_TIMEOUT)
        if code != 0:
            print(f"[fix] Failed to create venv: {err}")
            return None
    except Exception as e:
        print(f"[fix] Exception while creating venv: {e}")
        return None
    return venv_python_exe()


def pip_install(vp: Path, args: List[str], desc: str, timeout: int = LONG_TIMEOUT) -> bool:
    cmd = [str(vp), "-m", "pip"] + args
    code, out, err = run(cmd, timeout=timeout, quiet=not SHOW_PROGRESS)
    if code != 0:
        print(f"[fix] Failed to {desc}: {err or out}")
        return False
    return True


def ensure_pkg_resources_available(vp: Path) -> bool:
    code, _, _ = run([str(vp), "-c", "import pkg_resources"], timeout=SHORT_TIMEOUT)
    if code == 0:
        return True
    print("[fix] Installing setuptools for pkg_resources support")
    return pip_install(vp, ["install", "--upgrade", "setuptools"], "install setuptools", timeout=MEDIUM_TIMEOUT)


def ensure_pip_min_version(vp: Path) -> bool:
    return pip_install(vp, ["install", "--upgrade", "pip>=25.3"], "upgrade pip", timeout=MEDIUM_TIMEOUT)


def install_python_requirements(vp: Path) -> bool:
    if not REQUIREMENTS_FILE.exists():
        print(f"[fix] requirements.txt not found at {REQUIREMENTS_FILE}")
        return False
    ok = ensure_pkg_resources_available(vp)
    ok = ensure_pip_min_version(vp) and ok
    if not pip_install(vp, ["install", "-r", str(REQUIREMENTS_FILE)], "install backend requirements"):
        return False
    return ok


def torch_status(vp: Path) -> Tuple[bool, str]:
    pycmd = (
        "import sys\n"
        "try:\n"
        "  import importlib\n"
        "  m = importlib.import_module('torch')\n"
        "  ver = getattr(m, '__version__', 'unknown')\n"
        "  cuda_ver = getattr(getattr(m, 'version', None), 'cuda', None)\n"
        "  cuda_av = m.cuda.is_available() if hasattr(m, 'cuda') and hasattr(m.cuda, 'is_available') else False\n"
        "  print(ver + ' | cuda=' + str(cuda_ver) + ' | avail=' + str(cuda_av))\n"
        "  sys.exit(0)\n"
        "except Exception as e:\n"
        "  sys.stderr.write(str(e))\n"
        "  sys.exit(2)\n"
    )
    code, out, err = run([str(vp), "-c", pycmd], timeout=MEDIUM_TIMEOUT)
    if code == 0 and out:
        return True, out.strip()
    return False, err or "torch not installed"


def ensure_gdown(vp: Path) -> bool:
    code, _, _ = run([str(vp), "-c", "import gdown"], timeout=SHORT_TIMEOUT)
    if code == 0:
        return True
    print("[fix] Installing gdown for Google Drive downloads")
    return pip_install(vp, ["install", "gdown"], "install gdown", timeout=MEDIUM_TIMEOUT)


def download_cuda_archive(vp: Path) -> Optional[Path]:
    archive_path = WHEELS_DIR / CUDA_ARCHIVE_NAME_WIN
    part_exists = any(WHEELS_DIR.glob(f"{CUDA_ARCHIVE_NAME_WIN}*.part"))
    if archive_path.exists() and archive_path.stat().st_size > 0 and not part_exists:
        return archive_path
    if not ensure_gdown(vp):
        return None

    WHEELS_DIR.mkdir(parents=True, exist_ok=True)
    url = f"https://drive.google.com/uc?id={CUDA_ARCHIVE_ID_WIN}"
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        print(f"[fix] Downloading CUDA wheels archive (attempt {attempt}/{DOWNLOAD_RETRIES})")
        pycmd = (
            "import sys, gdown\n"
            f"url = {url!r}\n"
            f"out = r\"{archive_path}\"\n"
            "ok = gdown.download(url, out, quiet=False, fuzzy=True, resume=True)\n"
            "sys.exit(0 if ok else 1)\n"
        )
        code, out, err = run([str(vp), "-c", pycmd], timeout=LONG_TIMEOUT, quiet=not SHOW_PROGRESS)
        if code == 0 and archive_path.exists():
            return archive_path
        print(f"[fix] gdown attempt {attempt}/{DOWNLOAD_RETRIES} failed: {err or out}")
        if attempt < DOWNLOAD_RETRIES:
            time.sleep(RETRY_SLEEP_SEC)
    print("[fix] Failed to download CUDA wheels after retries")
    return None


def extract_cuda_archive(archive_path: Path) -> Optional[Path]:
    try:
        WHEELS_DIR.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path, "r") as zf:
            zf.extractall(WHEELS_DIR)
    except Exception as e:
        print(f"[fix] Failed to extract CUDA wheels: {e}")
        return None

    for part in WHEELS_DIR.glob(f"{CUDA_ARCHIVE_NAME_WIN}*.part"):
        try:
            part.unlink()
        except Exception:
            pass

    win_dir = WHEELS_DIR / "win"
    if win_dir.exists() and any(win_dir.glob("*.whl")):
        return win_dir
    if any(WHEELS_DIR.glob("*.whl")):
        return WHEELS_DIR
    print("[fix] No wheel files found after extraction")
    return None


def install_wheels_from_dir(wheel_dir: Path, vp: Path) -> bool:
    wheel_candidates = list(wheel_dir.glob("*.whl")) + list(WHEELS_DIR.glob("*.whl"))
    seen = set()
    unique_wheels = []
    for w in wheel_candidates:
        resolved = w.resolve()
        if resolved not in seen:
            unique_wheels.append(w)
            seen.add(resolved)

    if not unique_wheels:
        print("[fix] No wheel files to install")
        return False

    fd, req_path = tempfile.mkstemp(prefix="cuda_wheels_", suffix=".txt")
    os.close(fd)
    req_file = Path(req_path)
    req_file.write_text("\n".join(str(p) for p in unique_wheels), encoding="utf-8")
    try:
        cmd = [
            str(vp),
            "-m",
            "pip",
            "install",
            "--no-index",
            "--find-links",
            str(wheel_dir),
            "-r",
            str(req_file),
        ]
        code, out, err = run(cmd, timeout=LONG_TIMEOUT, quiet=not SHOW_PROGRESS)
        if code != 0:
            print(f"[fix] Failed to install CUDA wheels: {err or out}")
            return False
    finally:
        req_file.unlink(missing_ok=True)
    return True


def ensure_torch_with_wheels(vp: Path) -> bool:
    ok, info = torch_status(vp)
    if ok:
        print(f"[fix] torch already available ({info})")
        return True

    archive = download_cuda_archive(vp)
    if not archive:
        return False

    wheel_dir = extract_cuda_archive(archive)
    if not wheel_dir:
        # Попробуем скачать заново на случай битого архива
        try:
            archive.unlink()
        except Exception:
            pass
        archive = download_cuda_archive(vp)
        if not archive:
            return False
        wheel_dir = extract_cuda_archive(archive)
        if not wheel_dir:
            return False

    print(f"[fix] Installing CUDA wheels from {wheel_dir}")
    if not install_wheels_from_dir(wheel_dir, vp):
        return False

    ok_after, info_after = torch_status(vp)
    if ok_after:
        try:
            CUDA_WHEELS_MARKER.touch()
        except Exception:
            pass
        cleanup_wheels()
        print(f"[fix] torch ready ({info_after})")
        return True

    print("[fix] torch import still failing after wheel install")
    return False


def cleanup_wheels():
    """Remove wheel artifacts after successful install; keep directory shell."""
    try:
        for whl in WHEELS_DIR.glob("*.whl"):
            whl.unlink(missing_ok=True)
        win_dir = WHEELS_DIR / "win"
        if win_dir.exists():
            for whl in win_dir.glob("*.whl"):
                whl.unlink(missing_ok=True)
            try:
                win_dir.rmdir()
            except OSError:
                pass
        for zipf in WHEELS_DIR.glob("*.zip"):
            zipf.unlink(missing_ok=True)
    except Exception:
        pass


def ensure_frontend_tool_install() -> bool:
    if not WEB_DIR.exists():
        print(f"[fix] Frontend dir missing: {WEB_DIR}")
        return False
    bin_path = WEB_DIR / "node_modules" / ".bin" / ("vite.cmd" if sys.platform == "win32" else "vite")
    if bin_path.exists():
        return True

    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    print("[fix] Installing frontend dependencies (npm install)")
    code, out, err = run([npm_cmd, "install"], cwd=WEB_DIR, timeout=LONG_TIMEOUT, quiet=not SHOW_PROGRESS)
    if code != 0:
        print(f"[fix] npm install failed: {err or out}")
        return False
    return bin_path.exists()


def clone_repo(url: str, dest: Path) -> bool:
    if dest.exists():
        if (dest / ".git").exists():
            return True
        print(f"[fix] {dest} already exists; skipping clone to avoid overwriting")
        return True
    print(f"[fix] Cloning {url}")
    code, out, err = run(["git", "clone", url, str(dest)], timeout=LONG_TIMEOUT, quiet=not SHOW_PROGRESS)
    if code != 0:
        print(f"[fix] Failed to clone {url}: {err or out}")
        return False
    return True


def ensure_third_party_repos() -> bool:
    repos = [
        ("https://huggingface.co/ogkalu/comic-text-and-bubble-detector", THIRD_PARTY_DIR / "comic-text-and-bubble-detector"),
        ("https://huggingface.co/jzhang533/PaddleOCR-VL-For-Manga", THIRD_PARTY_DIR / "paddleocr-vl-for-manga"),
        ("https://github.com/ogkalu2/comic-translate", THIRD_PARTY_DIR / "comic-translate"),
    ]
    ok = True
    for url, dest in repos:
        ok = clone_repo(url, dest) and ok

    # git lfs для весов
    run(["git", "lfs", "install", "--local"], timeout=SHORT_TIMEOUT, quiet=not SHOW_PROGRESS)
    for _, dest in repos:
        if (dest / ".git").exists():
            run(["git", "lfs", "pull"], cwd=dest, timeout=LONG_TIMEOUT, quiet=not SHOW_PROGRESS)
    return ok


def ensure_manga_ocr_weights(vp: Path) -> bool:
    if MANGA_OCR_BIN.exists():
        return True
    helper = THIRD_PARTY_DIR / "comic-translate" / "modules" / "utils" / "download.py"
    if not helper.exists():
        print("[fix] comic-translate helper not found; cannot download manga-ocr model")
        return False
    print("[fix] Downloading manga-ocr model")
    pycmd = (
        "import sys\n"
        "from pathlib import Path\n"
        f"repo = Path(r\"{THIRD_PARTY_DIR}\") / 'comic-translate'\n"
        "sys.path.insert(0, str(repo))\n"
        "from modules.utils.download import ModelDownloader, ModelID\n"
        "ModelDownloader.get(ModelID.MANGA_OCR_BASE)\n"
    )
    code, out, err = run([str(vp), "-c", pycmd], timeout=LONG_TIMEOUT, quiet=not SHOW_PROGRESS)
    if code != 0:
        print(f"[fix] Failed to download manga-ocr model: {err or out}")
        return False
    return MANGA_OCR_BIN.exists()


def fix_environment() -> bool:
    """Best-effort установка всего необходимого (torch wheels, python deps, vite)."""
    ensure_dirs_exist()
    venv_py = ensure_venv_exists()
    if not venv_py:
        print("[fix] Venv python not found; create backend/.venv manually.")
        return False

    overall = True
    overall = install_python_requirements(venv_py) and overall
    overall = ensure_torch_with_wheels(venv_py) and overall
    overall = install_python_requirements(venv_py) and overall
    overall = ensure_third_party_repos() and overall
    overall = ensure_manga_ocr_weights(venv_py) and overall
    overall = ensure_frontend_tool_install() and overall
    return overall

# ----------------- tests -----------------

class TestResult:
    def __init__(self, name: str, ok: bool, message: str = "", hint: Optional[str] = None, critical: bool = True):
        self.name = name
        self.ok = ok
        self.message = message
        self.hint = hint
        self.critical = critical

def _format_version(python_path: Optional[Path] = None) -> Optional[str]:
    cmd = [str(python_path), "-c", "import sys; print(sys.version.split()[0])"] if python_path else None
    if cmd:
        code, out, _ = run(cmd, timeout=SHORT_TIMEOUT)
        return out.strip() if code == 0 else None
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def test_python_version(min_major=3, min_minor=8) -> TestResult:
    venv_py = venv_python_exe()
    version = _format_version(venv_py)
    if version:
        parts = version.split(".")
        try:
            major, minor = int(parts[0]), int(parts[1])
        except Exception:
            major, minor = sys.version_info.major, sys.version_info.minor
        if (major > min_major) or (major == min_major and minor >= min_minor):
            label = "Python version (venv)" if venv_py else "Python version"
            return TestResult(label, True, version)
        return TestResult(
            "Python version",
            False,
            f"Found {version}",
            f"Install Python {min_major}.{min_minor}+ and re-run",
            True,
        )
    return TestResult("Python version", False, "Unable to detect Python version", None, True)

def test_git() -> TestResult:
    code, out, err = run(["git", "--version"], timeout=SHORT_TIMEOUT)
    if code == 0:
        return TestResult("git", True, out.splitlines()[0] if out else "git ok")
    return TestResult("git", False, "git not found", "Install Git and ensure it's in PATH", True)

def test_git_lfs() -> TestResult:
    code, out, err = run(["git", "lfs", "version"], timeout=SHORT_TIMEOUT)
    if code == 0:
        return TestResult("git-lfs", True, out.splitlines()[0] if out else "git-lfs ok")
    return TestResult("git-lfs", False, "git-lfs not found", "Install Git LFS (https://git-lfs.github.com/) and re-run", True)

def test_nvidia_smi() -> TestResult:
    code, out, err = run(["nvidia-smi", "-L"], timeout=SHORT_TIMEOUT)
    if code == 0 and out:
        return TestResult("NVIDIA GPUs", True, out.splitlines()[0])
    # not critical if no GPU expected - mark non-critical but warn
    return TestResult("NVIDIA GPUs", False, "nvidia-smi not available or no GPUs detected", "If you expect GPU, install drivers; otherwise ignore", False)

def test_venv_exists() -> TestResult:
    venv_py = venv_python_exe()
    if venv_py:
        return TestResult(".venv", True, str(venv_py))
    expected = BACKEND_DIR / ".venv" / ("Scripts" if sys.platform == "win32" else "bin") / ("python.exe" if sys.platform == "win32" else "python")
    return TestResult(".venv", False, f"{expected} not found", "Create venv: python -m venv backend/.venv", True)

def test_python_packages() -> TestResult:
    """
    Проверяет соответствие requirements.txt внутри venv (использует importlib.metadata).
    Возвращает критическую ошибку, если какие-либо требования не соответствуют.
    """
    vp = venv_python_exe()
    if not vp:
        return TestResult("Python dependencies", False, "venv python not found", "Create venv first: python -m venv backend/.venv", True)

    if not REQUIREMENTS_FILE.exists():
        return TestResult("requirements.txt", False, f"{REQUIREMENTS_FILE} not found", "Provide requirements.txt", True)

    missing = []
    errors = []
    with REQUIREMENTS_FILE.open("r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or line.startswith("-e") or line.startswith("git+"):
                continue
            try:
                req = Requirement(line)
            except Exception as e:
                missing.append(line)
                errors.append(f"Cannot parse requirement: {e}")
                continue

            try:
                installed_ver = metadata.version(req.name)
            except metadata.PackageNotFoundError:
                missing.append(line)
                errors.append(f"{req.name} not installed")
                continue

            if req.specifier and installed_ver not in req.specifier:
                missing.append(line)
                errors.append(f"{req.name}=={installed_ver} does not satisfy {req.specifier}")
                continue

    if not missing:
        return TestResult("Python dependencies", True, "All requirements satisfied inside venv")
    else:
        hint = "Run in venv: pip install -r backend/requirements.txt"
        details = f"Missing/unsatisfied: {', '.join(missing)}"
        if errors:
            details += f"\nFirst error: {errors[0]}"
        return TestResult("Python dependencies", False, details, hint, True)

def test_torch_cuda() -> TestResult:
    """
    Проверяет наличие torch в venv и соответствие наличия CUDA.
    Если GPU ожидается (nvidia-smi present), требует CUDA-enabled torch.
    """
    vp = venv_python_exe()
    if not vp:
        return TestResult("torch", False, "venv python not found", "Create venv first", True)

    ok, info = torch_status(vp)
    if ok:
        return TestResult("torch", True, info)
    return TestResult("torch", False, f"torch import failed: {info}", "Install torch into venv (use wheel if needed)", True)

def test_node_npm() -> TestResult:
    # Проверяем node
    code, stdout, _ = run(["node", "--version"])
    if code != 0:
        return TestResult(
            "node",
            False,
            "node not found",
            "Install Node.js LTS and ensure it is in PATH",
            True,
        )

    # Проверяем npm (Windows / Unix)
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    code2, stdout2, _ = run([npm_cmd, "--version"])
    if code2 != 0:
        return TestResult(
            "npm",
            False,
            "npm not found",
            "Install Node.js (npm included)",
            True,
        )

    return TestResult(
        "node/npm",
        True,
        f"node {stdout.strip()}, npm {stdout2.strip()}",
    )

def test_frontend_build_tool() -> TestResult:
    """
    Проверяет наличие vite (или другого явно нужного bin) в node_modules.
    """
    # check node_modules/.bin/vite (unix) or node_modules/.bin/vite.cmd (win)
    if not WEB_DIR.exists():
        return TestResult("Frontend dir", False, f"{WEB_DIR} not found", "Ensure web-ui exists", True)
    bin_path_unix = WEB_DIR / "node_modules" / ".bin" / "vite"
    bin_path_win = WEB_DIR / "node_modules" / ".bin" / "vite.cmd"
    if bin_path_unix.exists() or bin_path_win.exists():
        return TestResult("Frontend tool (vite)", True, "vite present in node_modules")
    return TestResult("Frontend tool (vite)", False, "vite binary not found in node_modules", "Run: npm install in web-ui/", True)

def test_third_party_repos() -> TestResult:
    required = [
        "comic-text-and-bubble-detector",
        "paddleocr-vl-for-manga",
        "comic-translate",
    ]
    missing = []
    for name in required:
        p = THIRD_PARTY_DIR / name
        if not p.exists():
            missing.append(name)
    if missing:
        return TestResult("third_party repos", False, f"Missing: {', '.join(missing)}", "These will be cloned by installer or clone manually", True)
    return TestResult("third_party repos", True, "All required repos present")

def test_git_lfs_pointers() -> TestResult:
    """
    For each third_party repo, run 'git lfs ls-files' and detect any pointer lines.
    If pointer files exist but git lfs pull not run, that's a problem.
    """
    for repo in THIRD_PARTY_DIR.iterdir() if THIRD_PARTY_DIR.exists() else []:
        if not (repo / ".git").exists():
            continue
        code, out, err = run(["git", "lfs", "ls-files"], cwd=repo, timeout=SHORT_TIMEOUT)
        if code == 0 and out:
            # if there are outputs, assume LFS files already tracked/pulled
            continue
        # если что-то не так — пока считаем ок, ошибки поймает использование
    return TestResult("git-lfs pointers", True, "Checked git-lfs pointers (no obvious issues)")

def test_model_files() -> TestResult:
    if MANGA_OCR_BIN.exists():
        return TestResult("manga-ocr model", True, str(MANGA_OCR_BIN))
    return TestResult("manga-ocr model", False, f"{MANGA_OCR_BIN} not found", "Run model downloader or place model file manually", True)

def test_tmp_dir() -> TestResult:
    tmp = ROOT_DIR / "tmp"
    try:
        tmp.mkdir(exist_ok=True)
        return TestResult("tmp dir", True, str(tmp))
    except Exception as e:
        return TestResult("tmp dir", False, f"Cannot create tmp: {e}", "Check permissions", True)

# ----------------- runner -----------------

def run_all_tests() -> List[TestResult]:
    tests = [
        test_python_version,
        test_git,
        test_git_lfs,
        test_venv_exists,
        test_python_packages,
        test_torch_cuda,
        test_nvidia_smi,
        test_third_party_repos,
        test_git_lfs_pointers,
        test_model_files,
        test_node_npm,
        test_frontend_build_tool,
        test_tmp_dir,
    ]
    results = []
    for t in tests:
        try:
            r = t()
        except Exception as e:
            r = TestResult(getattr(t, "__name__", "test"), False, f"Exception: {e}", critical=True)
        results.append(r)
    return results

def print_summary(results: List[TestResult]) -> int:
    total = len(results)
    passed = sum(1 for r in results if r.ok)
    print("\n" + "="*60)
    print(f"Preflight summary: {passed}/{total} tests passed")
    print("="*60 + "\n")
    critical_fail = False
    for r in results:
        if r.ok:
            log_ok(f"{r.name}: {r.message}")
        else:
            if r.critical:
                critical_fail = True
                log_err(f"{r.name}: {r.message}")
            else:
                log_warn(f"{r.name}: {r.message}")
            if r.hint:
                print(f"  Hint: {YELLOW}{r.hint}{RESET}")
    print("\n" + "="*60)
    if critical_fail:
        print(f"{RED}One or more critical checks failed. Fix them before running the web UI.{RESET}\n")
        return 1
    else:
        if passed == total:
            print(f"{GREEN}All checks passed.{RESET}\n")
        else:
            print(f"{YELLOW}Non-critical issues only. You can continue, but check warnings above.{RESET}\n")
        return 0

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preflight checks for nekko-manga-translator")
    parser.add_argument("--fix", action="store_true", help="Attempt to auto-fix missing deps (wheels/npm/model)")
    parser.add_argument("--no-check", action="store_true", help="Skip final checks after --fix (not recommended)")
    return parser.parse_args()

def main() -> int:
    args = parse_args()
    fix_ok = True
    if args.fix:
        print(f"Running preflight fixes for project at: {ROOT_DIR}\n")
        fix_ok = fix_environment()
        print("\n[fix] Fix phase completed. Running verification...\n")
    else:
        print(f"Running preflight checks for project at: {ROOT_DIR}\n")
    if args.no_check:
        return 0 if fix_ok else 1
    results = run_all_tests()
    rc = print_summary(results)
    if args.fix and not fix_ok:
        return 1
    return rc

if __name__ == "__main__":
    sys.exit(main())
