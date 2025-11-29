#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="treadmill-fullstack"
CONTAINER_NAME="treadmill-fullstack"
BACKEND_PORT=5227
DOCKER_CONTEXT="home"  # same as in deploy_all.sh

if [ -n "$DOCKER_CONTEXT" ]; then
  DOCKER_CMD=(docker --context "$DOCKER_CONTEXT")
else
  DOCKER_CMD=(docker)
fi

# Reuse the main deploy script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/deploy-all.sh"

echo
echo "==> Attaching to logs for container '$CONTAINER_NAME'..."
echo "    Press Ctrl+C to stop watching logs (container will keep running)."
echo

"${DOCKER_CMD[@]}" logs -f "$CONTAINER_NAME"
