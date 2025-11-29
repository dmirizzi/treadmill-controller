#!/usr/bin/env bash
set -euo pipefail

# Adjust these as needed
IMAGE_NAME="treadmill-fullstack"
CONTAINER_NAME="treadmill-fullstack"
BACKEND_PORT=5227

# If you deploy to the Ubuntu home server via Docker context:
DOCKER_CONTEXT="home"
# If you deploy to whatever is current context, set:
# DOCKER_CONTEXT=""

if [ -n "$DOCKER_CONTEXT" ]; then
  DOCKER_CMD=(docker --context "$DOCKER_CONTEXT")
else
  DOCKER_CMD=(docker)
fi

echo "==> Building image '$IMAGE_NAME'..."
"${DOCKER_CMD[@]}" build -t "$IMAGE_NAME" .

echo "==> Stopping old container (if any)..."
"${DOCKER_CMD[@]}" stop "$CONTAINER_NAME" 2>/dev/null || true
"${DOCKER_CMD[@]}" rm "$CONTAINER_NAME" 2>/dev/null || true

echo "==> Starting new container..."
"${DOCKER_CMD[@]}" run -d \
  --name "$CONTAINER_NAME" \
  -p "${BACKEND_PORT}:5227" \
  --privileged \
  -v /var/run/dbus:/var/run/dbus \
  "$IMAGE_NAME"

echo "==> Deployed. App should be reachable at: http://home.local:${BACKEND_PORT}/"
echo "    API base: http://home.local:${BACKEND_PORT}/api/"
