#!/usr/bin/env bash
# Despliega una versión publicada en GHCR en el servidor, con Docker Compose.
# La usa el job de despliegue de cd.yml (runner autohospedado) y también se puede correr a mano.
#
# Uso: scripts/deploy.sh <pruebas|produccion> <etiqueta>      ej. scripts/deploy.sh produccion sha-1a2b3c4
#
# Cada entorno es un proyecto de Compose aparte (asistec-pruebas, asistec-produccion) con su
# carpeta en $ASISTEC_HOME/<entorno>/ (por defecto /opt/asistec), donde quedan:
#   .env               variables del entorno (las escribe el pipeline desde GitHub Secrets)
#   version-actual     etiqueta desplegada ahora
#   version-anterior   etiqueta a la que vuelve scripts/rollback.sh
#   historial.log      una línea por despliegue o reversión (fecha UTC, entorno, etiqueta)
# En "pruebas" la base de datos se borra en cada despliegue: la prueba de carga parte de cero
# y no ensucia los datos de producción.
set -euo pipefail
ENTORNO="${1:?Uso: scripts/deploy.sh <pruebas|produccion> <etiqueta>}"
ETIQUETA="${2:?Uso: scripts/deploy.sh <pruebas|produccion> <etiqueta>}"
[[ "$ENTORNO" =~ ^(pruebas|produccion)$ ]] || { echo "Entorno inválido: $ENTORNO" >&2; exit 2; }
[[ "$ETIQUETA" =~ ^(sha-[0-9a-f]{7,40}|v[0-9]+\.[0-9]+\.[0-9]+)$ ]] || { echo "Etiqueta inválida: $ETIQUETA (use sha-<commit> o vX.Y.Z; nunca latest)" >&2; exit 2; }

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${ASISTEC_HOME:-/opt/asistec}/$ENTORNO"
mkdir -p "$DIR"
[[ -f "$DIR/.env" ]] || { echo "Falta $DIR/.env (cópielo de .env.example y ajuste JWT_SECRET y los puertos)" >&2; exit 1; }

compose() {
  IMAGE_TAG="$ETIQUETA" docker compose --project-name "asistec-$ENTORNO" --env-file "$DIR/.env" \
    -f "$RAIZ/docker-compose.yml" -f "$RAIZ/deploy/docker-compose.prod.yml" "$@"
}

echo "==> Descargando las imágenes $ETIQUETA"
compose pull --quiet

if [[ "$ENTORNO" == "pruebas" ]]; then
  echo "==> Pruebas: se borra la base de datos para medir desde cero"
  compose down --volumes --remove-orphans
fi

echo "==> Desplegando $ETIQUETA en $ENTORNO (espera a que los healthchecks estén en verde)"
compose up --detach --no-build --remove-orphans --wait --wait-timeout 120

ACTUAL="$(cat "$DIR/version-actual" 2>/dev/null || true)"
if [[ -n "$ACTUAL" && "$ACTUAL" != "$ETIQUETA" ]]; then
  echo "$ACTUAL" > "$DIR/version-anterior"
fi
echo "$ETIQUETA" > "$DIR/version-actual"
echo "$(date -u +%FT%TZ) $ENTORNO despliegue $ETIQUETA (antes: ${ACTUAL:-ninguna})" >> "$DIR/historial.log"
compose ps
echo "==> $ENTORNO quedó en $ETIQUETA (anterior: $(cat "$DIR/version-anterior" 2>/dev/null || echo ninguna))"
