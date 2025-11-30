# Treadmill Control

Custom control app for the **Kiddoza walking pad / LJJ-sports treadmill**.

- Web UI (Angular, mobile-friendly) to:
  - Connect to the treadmill
  - Start/stop the belt
  - Set speed
  - See live stats (speed, time, distance, calories)
- Backend (Python, FastAPI, Bleak) running on a **Linux home server** with Bluetooth.
- Everything is packaged into **one Docker container** that serves both the API and the frontend.

You open the app from any device on your network (phone, laptop, tablet) and control the treadmill over Bluetooth via the home server.

---

## Architecture Overview

**Frontend**

- `frontend/`
- Angular standalone app
- Built into static files (`dist/treadmill-ui/browser`) and served by the backend from `/`

**Backend**

- `backend/`
- `app.py` – FastAPI app
- `treadmill_controller.py` – BLE logic using Bleak
- Exposes:
  - REST: `/api/status`, `/api/connect`, `/api/start`, `/api/stop`, `/api/speed`
  - SSE: `/api/events` (server-sent events with live status updates)
- Talks to treadmill via Bluetooth LE on the home server

**Container**

- `Dockerfile`
- Stage 1: build Angular frontend
- Stage 2: install Python + backend, copy frontend into `./static`, run `uvicorn`
- Needs access to host Bluetooth (`--privileged` + `/var/run/dbus` mount)

**Deployment scripts**

- `deploy_all.sh` – build + deploy (non-interactive)
- `deploy_and_attach.sh` – build + deploy + attach to logs

---

## Prerequisites

### On the home server (Linux)

- Docker (and optionally docker-compose, but not required)
- Bluetooth stack (BlueZ):
  - `bluetoothd` running
  - `bluetoothctl` available
- A working Bluetooth adapter (e.g. `hci0`) that can see your treadmill via `bluetoothctl scan on`

### On your macOS dev machine

- Docker Desktop
- Node.js + npm (for local Angular dev, optional if you only deploy via Docker)
- Python + venv (only needed if you want to run backend directly outside Docker)
- A Docker context pointing at the home server, e.g.:

  ```bash
  docker context create home \
    --docker "host=ssh://[server url]"
  docker context use home
