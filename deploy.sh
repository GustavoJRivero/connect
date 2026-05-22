#!/usr/bin/env bash
# Deploy script for SistemaConnect on the production VPS.
#
# Lo ejecuta GitHub Actions vía SSH después de copiar
#   - docker-compose.prod.yml
#   - Caddyfile
#   - deploy.sh
# al directorio configurado en el secret DEPLOY_PATH (por ejemplo /opt/connect).
#
# El archivo `.env` con secretos de producción debe existir previamente
# en ese directorio y NO se versiona en git.
#
# Variables de entorno esperadas (las inyecta el workflow o el .env):
#   IMAGE_TAG         tag corto del commit (ej. abc123def456). Default: latest
#   BACKEND_IMAGE     repo de la imagen del backend en GHCR
#   FRONTEND_IMAGE    repo de la imagen del frontend en GHCR
#
# Uso manual desde el server:
#   IMAGE_TAG=latest ./deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "ERROR: no se encuentra $COMPOSE_FILE en $SCRIPT_DIR"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: falta $ENV_FILE en $SCRIPT_DIR (copiar de .env.example y completar)."
  exit 1
fi

# Cargar el .env del server para que docker compose vea BACKEND_IMAGE/FRONTEND_IMAGE
# si no fueron pasados como variables exportadas.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export IMAGE_TAG="${IMAGE_TAG:-latest}"
export BACKEND_IMAGE="${BACKEND_IMAGE:?BACKEND_IMAGE is required (export en .env o por el deploy)}"
export FRONTEND_IMAGE="${FRONTEND_IMAGE:?FRONTEND_IMAGE is required (export en .env o por el deploy)}"

mkdir -p secrets

echo "==> Pull de imágenes (${IMAGE_TAG}) desde GHCR"
docker compose -f "$COMPOSE_FILE" pull

echo "==> Up con redeploy de servicios"
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "==> Esperando a que el backend levante"
for i in $(seq 1 30); do
  cid=$(docker compose -f "$COMPOSE_FILE" ps -q backend || true)
  if [[ -n "$cid" ]]; then
    state=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")
    if [[ "$state" == "running" ]]; then
      echo "    backend: running"
      break
    fi
  fi
  sleep 2
done

echo "==> Limpiando imágenes viejas (dangling)"
docker image prune -f >/dev/null

echo "==> Estado final"
docker compose -f "$COMPOSE_FILE" ps

echo "==> Deploy OK (tag=${IMAGE_TAG})"
