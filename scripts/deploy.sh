#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-pixelbrain-vps}"
REMOTE_DIR="${REMOTE_DIR:-\$HOME/apps/recrutement-mira}"

echo "→ Sync vers ${VPS_HOST}:${REMOTE_DIR//\$HOME/~}"

RSYNC_DEST="${VPS_HOST}:~/apps/recrutement-mira/"

rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude '.env' \
  --exclude '.git' \
  --exclude '.cursor' \
  "${ROOT_DIR}/" "${RSYNC_DEST}"

ssh "${VPS_HOST}" bash -s <<'REMOTE'
set -euo pipefail
cd "$HOME/apps/recrutement-mira"
mkdir -p backend/recruitment-mvp/data

if [ ! -f .env ]; then
  echo "ERREUR: .env manquant sur le VPS ($HOME/apps/recrutement-mira/.env)"
  exit 1
fi

docker build -t recrutement-mira-web .
docker stop recrutement-mira-web 2>/dev/null || true
docker rm recrutement-mira-web 2>/dev/null || true
docker run -d \
  --name recrutement-mira-web \
  --network docker_ekowrk-network \
  --restart unless-stopped \
  --env-file .env \
  -v "$HOME/apps/recrutement-mira/backend/recruitment-mvp/data:/app/backend/recruitment-mvp/data" \
  recrutement-mira-web

sleep 2
docker logs recrutement-mira-web --tail 8
REMOTE

echo "→ Déploiement terminé : https://recrutement.mira.pixelbrain.fr"
