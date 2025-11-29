#!/usr/bin/env bash
set -euo pipefail

# ------------------------------
# Config
# ------------------------------

# Docker context name that points to your home server
DOCKER_CONTEXT_NAME="${DOCKER_CONTEXT_NAME:-home}"

# Image & container naming
IMAGE_NAME="${IMAGE_NAME:-treadmill-dotnet-backend}"
CONTAINER_NAME="${CONTAINER_NAME:-treadmill-dotnet}"

# Backend port inside container
BACKEND_PORT="${BACKEND_PORT:-5227}"

# dbus socket for BlueZ
DBUS_SOCKET="/var/run/dbus/system_bus_socket"

# Root of repo (directory where this script lives/../)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Using Docker context: ${DOCKER_CONTEXT_NAME}"
echo "==> Repo root: ${REPO_ROOT}"
echo "==> Image: ${IMAGE_NAME}"
echo "==> Container: ${CONTAINER_NAME}"
echo

# ------------------------------
# Build image
# ------------------------------

echo "==> Building image on remote Docker daemon..."
docker --context "${DOCKER_CONTEXT_NAME}" build \
  -f "${REPO_ROOT}/backend/Dockerfile" \
  -t "${IMAGE_NAME}" \
  "${REPO_ROOT}"

echo "==> Build complete."
echo

# ------------------------------
# Stop & remove existing container
# ------------------------------

echo "==> Stopping old container (if any)..."
docker --context "${DOCKER_CONTEXT_NAME}" stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true

echo "==> Removing old container (if any)..."
docker --context "${DOCKER_CONTEXT_NAME}" rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true

echo

# ------------------------------
# Run new container
# ------------------------------

echo "==> Starting new container..."

docker --context "${DOCKER_CONTEXT_NAME}" run -d \
  --name "${CONTAINER_NAME}" \
  -p "${BACKEND_PORT}:${BACKEND_PORT}" \
  --privileged \
  -v /var/run/dbus:/var/run/dbus \
  "${IMAGE_NAME}"


echo
echo "==> Done!"
echo "Backend should now be reachable at: http://home.local:${BACKEND_PORT}/"
echo "Check logs with:"
echo "  docker --context ${DOCKER_CONTEXT_NAME} logs -f ${CONTAINER_NAME}"
