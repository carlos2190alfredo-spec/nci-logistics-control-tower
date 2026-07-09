#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: pnpm backup:restore backups/file.sql"
  exit 1
fi

docker compose exec -T postgres psql -U nci -d nci_logistics < "$1"
echo "Restored $1"
