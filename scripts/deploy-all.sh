#!/usr/bin/env bash
set -euo pipefail

cd frontend/treadmill-ui && npm run build
cd ../..
rm -rf backend/TreadmillControl.WebApi/wwwroot/*
cp -r frontend/treadmill-ui/dist/treadmill-ui/browser/* backend/TreadmillControl.WebApi/wwwroot
./scripts/deploy-backend.sh
