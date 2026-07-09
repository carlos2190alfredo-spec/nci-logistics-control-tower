#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
stamp="$(date +%Y%m%d-%H%M%S)"
docker compose exec -T postgres pg_dump -U nci nci_logistics > "backups/nci-logistics-${stamp}.sql"
echo "Created backups/nci-logistics-${stamp}.sql"
