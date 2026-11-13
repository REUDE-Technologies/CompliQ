#!/usr/bin/env bash
# CompliQ Inspection Studio - starts the app and opens http://localhost:8765
set -e
cd "$(dirname "$0")"
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
if ! "$PY" -c "import ultralytics, fastapi, uvicorn, ulid, yaml, boto3" 2>/dev/null; then
  echo "First start: installing what the app needs into .venv (several minutes)..."
  [ -x .venv/bin/python ] || python3 -m venv .venv
  PY=.venv/bin/python
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -r requirements.txt
fi
exec "$PY" -m compliq_studio app "$@"
