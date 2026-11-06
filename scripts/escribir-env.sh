#!/usr/bin/env bash
# Escribe $ASISTEC_HOME/<entorno>/.env a partir de .env.example, con el secreto y los puertos del entorno.
# La usa cd.yml antes de desplegar: el secreto viene de GitHub Secrets (variable JWT_SECRET)
# y nunca queda en el repositorio. El archivo queda legible solo por el usuario del runner.
# Uso: JWT_SECRET=... scripts/escribir-env.sh <pruebas|produccion> <puerto-web> <puerto-backend>
# Con GRAFANA_ADMIN_PASSWORD definida, además activa el perfil observabilidad (Prometheus + Grafana).
set -euo pipefail
ENTORNO="${1:?Uso: scripts/escribir-env.sh <entorno> <puerto-web> <puerto-backend>}"
WEB_PORT="${2:?Falta el puerto web}"
BACKEND_PORT="${3:?Falta el puerto del backend}"
: "${JWT_SECRET:?Falta JWT_SECRET (configúrelo en el environment $ENTORNO de GitHub)}"
[[ ${#JWT_SECRET} -ge 32 ]] || { echo "JWT_SECRET debe tener al menos 32 caracteres" >&2; exit 1; }

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${ASISTEC_HOME:-/opt/asistec}/$ENTORNO"
mkdir -p "$DIR"
umask 077
{
  grep -vE '^(JWT_SECRET|WEB_PORT|BACKEND_PORT|GRAFANA_ADMIN_PASSWORD|COMPOSE_PROFILES)=' "$RAIZ/.env.example"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "WEB_PORT=$WEB_PORT"
  echo "BACKEND_PORT=$BACKEND_PORT"
  if [[ -n "${GRAFANA_ADMIN_PASSWORD:-}" ]]; then
    echo "COMPOSE_PROFILES=observabilidad"
    echo "GRAFANA_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD"
  fi
} > "$DIR/.env"
echo "==> $DIR/.env escrito (web en $WEB_PORT, backend en 127.0.0.1:$BACKEND_PORT)"
