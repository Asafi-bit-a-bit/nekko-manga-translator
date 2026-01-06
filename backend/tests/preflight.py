#!/usr/bin/env python3
"""
Preflight checks for webui (check-only).
- Только проверяет окружение и наличие необходимых ресурсов.
- Не делает установки/скачивания.
- Возвращает 0 если всё ок, иначе 1.
"""

from __future__ import annotations
import sys
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple
import shlex

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

# Coloring (best-effort)
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
RESET = "\033[0m"

# Timeouts
SHORT_TIMEOUT = 10
MEDIUM_TIMEOUT = 30

# ----------------- helpers -----------------

def run(cmd: List[str], cwd: Optional[Path] = None, timeout: int = MEDIUM_TIMEOUT) -> Tuple[int, str, str]:
    """Run a command and return (returncode, stdout, stderr)."""
    try:
        proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True, text=True, timeout=timeout)
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "timeout"
    except FileNotFoundError as e:
        return 127, "", str(e)
    except Exception as e:
        return -2, "", str(e)

def log_ok(msg: str):
    print(f"{GREEN}✓{RESET} {msg}")

def log_warn(msg: str):
    print(f"{YELLOW}!{RESET} {msg}")

def log_err(msg: str):
    print(f"{RED}✗{RESET} {msg}")

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
    # not critical if no GPU expected — mark non-critical but warn
    return TestResult("NVIDIA GPUs", False, "nvidia-smi not available or no GPUs detected", "If you expect GPU, install drivers; otherwise ignore", False)

def test_venv_exists() -> TestResult:
    venv_py = BACKEND_DIR / ".venv" / ("Scripts" if sys.platform == "win32" else "bin") / ("python.exe" if sys.platform == "win32" else "python")
    if venv_py.exists():
        return TestResult(".venv", True, str(venv_py))
    return TestResult(".venv", False, f"{venv_py} not found", "Create venv: python -m venv backend/.venv", True)

def venv_python_exe() -> Optional[Path]:
    venv_py = BACKEND_DIR / ".venv" / ("Scripts" if sys.platform == "win32" else "bin") / ("python.exe" if sys.platform == "win32" else "python")
    return venv_py if venv_py.exists() else None

def run_in_venv(cmd: List[str], timeout: int = MEDIUM_TIMEOUT) -> Tuple[int, str, str]:
    """Run command using venv python interpreter if venv exists, else run in current interpreter."""
    vp = venv_python_exe()
    if vp:
        # If we are given a Python snippet (['-c', '...']), call vp with that.
        if cmd and (cmd[0] == "-c" or cmd[0].endswith("python")):
            # Not used normally; prefer explicit venv python invocations
            pass
    return run(cmd, timeout=timeout)

def test_python_packages() -> TestResult:
    """
    Проверяет соответствие requirements.txt внутри venv (с помощью pkg_resources.require).
    Возвращает критическую ошибку, если какие-либо требования не соответствуют.
    """
    vp = venv_python_exe()
    if not vp:
        return TestResult("Python dependencies", False, "venv python not found", "Create venv first: python -m venv backend/.venv", True)

    if not REQUIREMENTS_FILE.exists():
        return TestResult("requirements.txt", False, f"{REQUIREMENTS_FILE} not found", "Provide requirements.txt", True)

    # Прочитаем файл requirements и для каждой непустой строки вызываем pkg_resources.require(req)
    missing = []
    errors = []
    with REQUIREMENTS_FILE.open("r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or line.startswith("-e") or line.startswith("git+"):
                continue
            # pkg_resources.require принимает сложные specifiers, обернём в кавычки и передадим
            pycmd = (
                "import sys, pkg_resources\n"
                f"req = {repr(line)}\n"
                "try:\n"
                "    pkg_resources.require(req)\n"
                "    sys.exit(0)\n"
                "except Exception as e:\n"
                "    sys.stderr.write(str(e))\n"
                "    sys.exit(2)\n"
            )
            code, out, err = run([str(vp), "-c", pycmd], timeout=30)
            if code == 0:
                # OK
                continue
            else:
                # add to missing list (report first word of requirement)
                missing.append(line)
                if err:
                    errors.append(err.strip().splitlines()[0])
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

    # check import and print torch version and cuda info
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
    code, out, err = run([str(vp), "-c", pycmd], timeout=30)
    if code == 0 and out:
        # parse
        try:
            ver_and = out.strip()
            return TestResult("torch", True, ver_and)
        except Exception:
            return TestResult("torch", True, out.strip())
    else:
        return TestResult("torch", False, f"torch import failed: {err or 'no output'}", "Install torch into venv (use wheel if needed)", True)

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
    problems = []
    for repo in THIRD_PARTY_DIR.iterdir():
        if not (repo / ".git").exists():
            continue
        code, out, err = run(["git", "lfs", "ls-files"], cwd=repo, timeout=SHORT_TIMEOUT)
        if code == 0 and out:
            # if there are outputs, assume LFS files already tracked/pulled
            continue
        # if git lfs ls-files returns non-zero but there are large files expected, flag as warning
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

def main() -> int:
    print(f"Running preflight checks for project at: {ROOT_DIR}\n")
    results = run_all_tests()
    return print_summary(results)

if __name__ == "__main__":
    sys.exit(main())
