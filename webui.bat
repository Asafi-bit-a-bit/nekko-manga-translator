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

rem ======================================================
rem Launch configuration (editable via configure_launch.py)
rem ======================================================
set "WEBUI_AUTO_MODE=auto_fix"
set "WEBUI_SHOW_PROGRESS=1"

rem ======================================================
rem Ensure base directories (FIX WinError 3)
rem ======================================================
if not exist "%WHEELS_DIR%" mkdir "%WHEELS_DIR%"
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"
if not exist "%THIRD_PARTY_DIR%" mkdir "%THIRD_PARTY_DIR%"

rem ======================================================
rem Ensure Python (minimal checks; preflight handles the rest)
rem ======================================================
call :find_python || exit /b 1

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
rem Preflight according to configured mode
rem ======================================================
set "FIRST_FIX_MARKER=%VENV_DIR%\.first_fix_done"
if "%WEBUI_AUTO_MODE%"=="" set "WEBUI_AUTO_MODE=verify_first"
if "%WEBUI_SHOW_PROGRESS%"=="" set "WEBUI_SHOW_PROGRESS=0"
set "EFFECTIVE_MODE=%WEBUI_AUTO_MODE%"
if "%WEBUI_AUTO_MODE%"=="auto_fix" (
  if exist "%FIRST_FIX_MARKER%" set "EFFECTIVE_MODE=verify_first"
)

if exist "%BACKEND_DIR%\tests\preflight.py" (
  if /I "%EFFECTIVE_MODE%"=="auto_fix" (
    echo [webui] Running preflight with auto-fix
    set "WEBUI_SHOW_PROGRESS=%WEBUI_SHOW_PROGRESS%"
    "%VENV_PY%" "%BACKEND_DIR%\tests\preflight.py" --fix
    set "PREFLIGHT_RC=!ERRORLEVEL!"
    if "!PREFLIGHT_RC!"=="0" (
      type nul > "%FIRST_FIX_MARKER%"
      set "WEBUI_AUTO_MODE=verify_first"
    )
  ) else (
    echo [webui] Running preflight (verify then fix if needed)
    set "WEBUI_SHOW_PROGRESS=%WEBUI_SHOW_PROGRESS%"
    "%VENV_PY%" "%BACKEND_DIR%\tests\preflight.py"
    set "PREFLIGHT_RC=!ERRORLEVEL!"
    if not "!PREFLIGHT_RC!"=="0" (
      echo [webui] Verification failed, running auto-fix
      "%VENV_PY%" "%BACKEND_DIR%\tests\preflight.py" --fix
      set "PREFLIGHT_RC=!ERRORLEVEL!"
      if "!PREFLIGHT_RC!"=="0" type nul > "%FIRST_FIX_MARKER%"
    )
  )
) else (
  set "PREFLIGHT_RC=0"
)

rem ======================================================
rem Start services (only if preflight passed)
rem ======================================================
if not "%PREFLIGHT_RC%"=="0" (
  echo [webui] Preflight failed after auto-fix. Fix issues above and re-run.
  exit /b 1
)
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
:find_python
where python >nul 2>&1 && set "PY_CMD=python" && set "PY_ARGS=" && exit /b 0
where py >nul 2>&1 && set "PY_CMD=py" && set "PY_ARGS=-3" && exit /b 0
echo Python not found
exit /b 1
