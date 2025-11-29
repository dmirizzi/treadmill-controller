# ---------- Stage 1: Build Angular frontend ----------
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend

# 1) Install frontend deps (cached unless package*.json changes)
COPY frontend/package*.json ./
RUN npm ci

# 2) Copy rest of Angular app and build
COPY frontend/ .
RUN npm run build


# ---------- Stage 2: Python runtime with FastAPI + Bleak ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies for Bleak on Linux / BlueZ
RUN apt-get update && apt-get install -y \
    bluez bluez-hcidump dbus libglib2.0-dev \
    && rm -rf /var/lib/apt/lists/*

# 1) Install Python deps based on requirements.txt only
#    This layer is cached unless requirements.txt changes.
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 2) Copy the rest of the backend source code
COPY backend/ ./

# 3) Copy built Angular app into ./static
COPY --from=frontend-builder /frontend/dist/treadmill-ui/browser ./static

EXPOSE 5227

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5227"]