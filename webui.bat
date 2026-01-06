@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ======================================================
rem Paths
rem ======================================================
set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "WEB_DIR=%ROOT_DIR%web-ui"
set "THIRD_PARTY_DIR=%ROOT_DIR%third_party"
set "WHEELS_DIR=%ROOT_DIR%wheels"
set "TMP_DIR=%ROOT_DIR%tmp"

set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

set "REQ_BASE=%BACKEND_DIR%\requirements-base.txt"
set "REQ_FULL=%BACKEND_DIR%\requirements.txt"
set "DEPS_BASE_MARKER=%VENV_DIR%\.deps_base_installed"
set "DEPS_FULL_MARKER=%VENV_DIR%\.deps_full_installed"
set "CUDA_WHEELS_MARKER=%VENV_DIR%\.cuda_wheels_installed"
set "CUDA_ARCHIVE_ID_WIN=1cXJCDNb7TX_w8eafAwmfF2flGzjUgoHA"
set "CUDA_ARCHIVE_NAME_WIN=cuda_wheels_win.zip"
set "PADDLE_OCR_MIN_VRAM_GB=2"
set "PADDLE_OCR_DEVICE=cuda"

rem ======================================================
rem Ensure base directories (FIX WinError 3)
rem ======================================================
if not exist "%WHEELS_DIR%" mkdir "%WHEELS_DIR%"
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"
if not exist "%THIRD_PARTY_DIR%" mkdir "%THIRD_PARTY_DIR%"

rem ======================================================
rem Ensure basic tools
rem ======================================================
call :require_cmd git || exit /b 1
call :require_cmd npm || exit /b 1
call :find_python || exit /b 1

git lfs version >nul 2>&1 || (
  echo git-lfs is required. Install it and re-run.
  exit /b 1
)

rem ======================================================
rem Create venv if missing
rem ======================================================
if not exist "%VENV_DIR%" (
  echo [webui] Creating Python venv
  "%PY_CMD%" %PY_ARGS% -m venv "%VENV_DIR%" || exit /b 1
)

if not exist "%VENV_PY%" (
  echo Python not found in venv
  exit /b 1
)

rem ======================================================
rem Run preflight (check-only)
rem ======================================================
if exist "%BACKEND_DIR%\tests\preflight.py" (
  echo [webui] Running preflight checks
  "%VENV_PY%" "%BACKEND_DIR%\tests\preflight.py"
  set "PREFLIGHT_RC=%ERRORLEVEL%"
) else (
  set "PREFLIGHT_RC=0"
)

rem ======================================================
rem Install Python deps (CUDA-aware)
rem ======================================================
set "CUDA_AVAILABLE=0"
where nvidia-smi >nul 2>&1 && nvidia-smi -L >nul 2>&1 && set "CUDA_AVAILABLE=1"

if "%CUDA_AVAILABLE%"=="1" (
  call :install_base_deps || exit /b 1
  call :ensure_cuda_wheels || exit /b 1
) else (
  call :install_full_deps || exit /b 1
)

rem ======================================================
rem Clone third-party repos if missing
rem ======================================================
call :clone_repo "https://huggingface.co/ogkalu/comic-text-and-bubble-detector" "%THIRD_PARTY_DIR%\comic-text-and-bubble-detector"
call :clone_repo "https://huggingface.co/jzhang533/PaddleOCR-VL-For-Manga" "%THIRD_PARTY_DIR%\paddleocr-vl-for-manga"
call :clone_repo "https://github.com/ogkalu2/comic-translate" "%THIRD_PARTY_DIR%\comic-translate"

git lfs install --local >nul 2>&1

for %%R in (
  "%THIRD_PARTY_DIR%\comic-text-and-bubble-detector"
  "%THIRD_PARTY_DIR%\paddleocr-vl-for-manga"
) do (
  if exist "%%~R\.git" (
    pushd "%%~R"
    git lfs pull >nul 2>&1
    popd
  )
)

rem ======================================================
rem Ensure manga-ocr model
rem ======================================================
set "MANGA_OCR_BIN=%THIRD_PARTY_DIR%\comic-translate\models\ocr\manga-ocr-base\pytorch_model.bin"
if not exist "%MANGA_OCR_BIN%" (
  echo [webui] Downloading manga-ocr model
  "%VENV_PY%" -c "import sys; from pathlib import Path; repo=Path(r\"%THIRD_PARTY_DIR%\") / \"comic-translate\"; sys.path.insert(0, str(repo)); from modules.utils.download import ModelDownloader, ModelID; ModelDownloader.get(ModelID.MANGA_OCR_BASE)"
)

rem ======================================================
rem Ensure frontend deps
rem ======================================================
if not exist "%WEB_DIR%\node_modules\.bin\vite.cmd" (
  echo [webui] Installing frontend dependencies
  pushd "%WEB_DIR%"
  npm install || exit /b 1
  popd
)

rem ======================================================
rem Start services
rem ======================================================
echo [webui] Starting backend
start "" /B /D "%BACKEND_DIR%" "%VENV_PY%" -m uvicorn app:app --reload --host 0.0.0.0 --port 8000

echo [webui] Starting frontend
pushd "%WEB_DIR%"
npm run dev -- --host 0.0.0.0 --port 5173
popd

exit /b 0

rem ======================================================
rem FUNCTIONS
rem ======================================================

:require_cmd
where %~1 >nul 2>&1 || (
  echo Missing required command: %~1
  exit /b 1
)
exit /b 0

:find_python
where python >nul 2>&1 && set "PY_CMD=python" && set "PY_ARGS=" && exit /b 0
where py >nul 2>&1 && set "PY_CMD=py" && set "PY_ARGS=-3" && exit /b 0
echo Python not found
exit /b 1

:install_base_deps
if not exist "%DEPS_BASE_MARKER%" (
  echo [webui] Installing Python dependencies (base)
  "%VENV_PY%" -m pip install --upgrade pip || exit /b 1
  "%VENV_PY%" -m pip install -r "%REQ_BASE%" || exit /b 1
  type nul > "%DEPS_BASE_MARKER%"
) else (
  echo [webui] Python dependencies (base) already installed
)
exit /b 0

:install_full_deps
if not exist "%DEPS_FULL_MARKER%" (
  echo [webui] Installing Python dependencies (full)
  "%VENV_PY%" -m pip install --upgrade pip || exit /b 1
  "%VENV_PY%" -m pip install -r "%REQ_FULL%" || exit /b 1
  type nul > "%DEPS_FULL_MARKER%"
) else (
  echo [webui] Python dependencies (full) already installed
)
exit /b 0

:ensure_cuda_wheels
if not exist "%CUDA_WHEELS_MARKER%" (
  set "ARCHIVE_PATH=%WHEELS_DIR%\%CUDA_ARCHIVE_NAME_WIN%"

  "%VENV_PY%" -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('gdown') else 1)" >nul 2>&1
  if errorlevel 1 (
    "%VENV_PY%" -m pip install gdown || exit /b 1
  )

  if not exist "%ARCHIVE_PATH%" (
    "%VENV_PY%" -m gdown "%CUDA_ARCHIVE_ID_WIN%" -O "%ARCHIVE_PATH%" || exit /b 1
  )

  "%VENV_PY%" -c "from pathlib import Path; import zipfile; p=Path(r\"%ARCHIVE_PATH%\"); d=Path(r\"%WHEELS_DIR%\"); d.mkdir(parents=True, exist_ok=True); zipfile.ZipFile(p).extractall(d)" || exit /b 1

  if exist "%WHEELS_DIR%\win" (
    for /f "delims=" %%F in ('dir /b "%WHEELS_DIR%\win"') do (
      move /Y "%WHEELS_DIR%\win\%%F" "%WHEELS_DIR%\" >nul
    )
  )

  dir /b "%WHEELS_DIR%\*.whl" >nul 2>&1 || (
    echo CUDA wheel files not found in %WHEELS_DIR%
    exit /b 1
  )

  set "COUNT=0"
  set "REQ_FILE=%TMP_DIR%\cuda_wheels_%RANDOM%%RANDOM%.txt"
  del /q "!REQ_FILE!" >nul 2>&1
  for /f "delims=" %%F in ('dir /b /a:-d "%WHEELS_DIR%\*.whl" 2^>nul') do (
    >>"!REQ_FILE!" echo %WHEELS_DIR%\%%F
    set /a COUNT+=1
  )
  if "!COUNT!"=="0" (
    echo CUDA wheel files not found in %WHEELS_DIR%
    exit /b 1
  )

  echo [webui] Installing CUDA wheels offline
  "%VENV_PY%" -m pip install --no-index --find-links "%WHEELS_DIR%" -r "!REQ_FILE!" || exit /b 1
  del /q "!REQ_FILE!" >nul 2>&1
  type nul > "%CUDA_WHEELS_MARKER%"
) else (
  echo [webui] CUDA wheels already installed
)
exit /b 0

:clone_repo
if exist "%~2\.git" exit /b 0
if exist "%~2" exit /b 0
echo [webui] Cloning %~1
git clone "%~1" "%~2" || exit /b 1
exit /b 0
