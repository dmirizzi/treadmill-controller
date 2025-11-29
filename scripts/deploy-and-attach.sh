#!/usr/bin/env bash
set -euo pipefail

./scripts/deploy-all.sh

docker --context home logs -f treadmill-dotnet