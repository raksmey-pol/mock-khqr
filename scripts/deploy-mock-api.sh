#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$ROOT_DIR"

if docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.mock-api.yml up -d --build "$@"
  exit 0
fi

if command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f docker-compose.mock-api.yml up -d --build "$@"
  exit 0
fi

echo "Docker Compose is not available on this host."
echo "Install one of:"
echo "  - docker-compose-plugin (for 'docker compose')"
echo "  - docker-compose (legacy binary)"
exit 1
