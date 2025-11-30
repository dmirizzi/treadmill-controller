#!/usr/bin/env bash
set -euo pipefail

########################################
# CONFIG – EDIT THESE FOR YOUR PROJECT #
########################################

# Path to the frontend source (relative to repo root)
FRONTEND_DIR="frontend"

# Where the frontend build output ends up (e.g. React: build, Vite: dist)
FRONTEND_BUILD_DIR="$FRONTEND_DIR/dist/treadmill-ui/browser"      # or "$FRONTEND_DIR/build"

# Where your backend serves static files from
BACKEND_STATIC_DIR="backend/static"             # e.g. "static", "backend/static", etc.

# Python entry point for your server
PYTHON_ENTRY="backend/app.py"                       # e.g. "app.py" or "backend/main.py"

# Python version/command
PYTHON_BIN="python3"

# Venv location
VENV_DIR=".venv"

# Requirements file
REQUIREMENTS_FILE="backend/requirements.txt"


########################################
# 1) SET UP PYTHON VENV + DEPENDENCIES #
########################################

if [ ! -d "$VENV_DIR" ]; then
  echo "[+] Creating virtualenv in $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

if [ -f "$REQUIREMENTS_FILE" ]; then
  echo "[+] Installing Python dependencies from $REQUIREMENTS_FILE"
  pip install --upgrade pip
  pip install -r "$REQUIREMENTS_FILE"
else
  echo "[!] No $REQUIREMENTS_FILE found – skipping Python dependency install"
fi


#########################
# 2) BUILD FRONTEND     #
#########################

echo "[+] Building frontend in $FRONTEND_DIR"

pushd "$FRONTEND_DIR" > /dev/null

# If you use yarn or pnpm, swap this line:
#   yarn install && yarn build
#   pnpm install && pnpm build
if [ -f "package-lock.json" ]; then
  npm install
elif [ -f "yarn.lock" ]; then
  yarn install
elif [ -f "pnpm-lock.yaml" ]; then
  pnpm install
else
  echo "[!] No lockfile found (package-lock.json / yarn.lock / pnpm-lock.yaml) – running plain npm install"
  npm install
fi

# Build step (React/Vite/Next SPA: usually `npm run build`)
npm run build

popd > /dev/null


#########################
# 3) COPY TO STATIC DIR #
#########################

echo "[+] Copying built frontend from $FRONTEND_BUILD_DIR to $BACKEND_STATIC_DIR"

mkdir -p "$BACKEND_STATIC_DIR"

# Use rsync if available for clean sync; otherwise fallback to cp
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$FRONTEND_BUILD_DIR"/ "$BACKEND_STATIC_DIR"/
else
  echo "[!] rsync not found, using cp (old files in static may linger)"
  cp -R "$FRONTEND_BUILD_DIR"/ "$BACKEND_STATIC_DIR"/
fi


#########################
# 4) RUN SERVER         #
#########################

echo "[+] Starting server: $PYTHON_BIN $PYTHON_ENTRY"
echo "[i] (Ctrl+C to stop)"

cd backend
uvicorn app:app --host 0.0.0.0 --port 5227 --reload
