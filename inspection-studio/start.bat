@echo off
rem CompliQ Inspection Studio - double-click to start. Opens http://localhost:8765 in your browser.
setlocal
cd /d "%~dp0"
set "PY=python"
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
"%PY%" -c "import ultralytics, fastapi, uvicorn, ulid, yaml, boto3" 1>nul 2>nul
if errorlevel 1 goto install
goto run

:install
echo First start: installing what the app needs into .venv (several minutes, needs internet)...
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if errorlevel 1 (
  echo Python 3.10+ is needed. Install it from https://www.python.org/downloads/ and tick "Add to PATH".
  pause
  exit /b 1
)
set "PY=.venv\Scripts\python.exe"
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 (
  echo Installing packages failed. See the messages above.
  pause
  exit /b 1
)

:run
"%PY%" -m compliq_studio app
pause
