#!/usr/bin/env bash
# Restaura una copia de seguridad hecha con scripts/respaldo.sh. Detiene el sistema unos segundos:
# web y backend se apagan, el archivo reemplaza la base del volumen y se vuelven a encender.
# Antes de reemplazar, guarda la base actual con scripts/respaldo.sh (por si se eligió el archivo equivocado).
#
# Uso: scripts/restaurar.sh <proyecto> <archivo.db>
set -euo pipefail
PROYECTO="${1:?Uso: scripts/restaurar.sh <proyecto> <archivo.db>}"
ARCHIVO="${2:?Uso: scripts/restaurar.sh <proyecto> <archivo.db>}"
[[ -f "$ARCHIVO" ]] || { echo "No existe $ARCHIVO" >&2; exit 1; }
CARPETA="$(cd "$(dirname "$ARCHIVO")" && pwd)"
NOMBRE="$(basename "$ARCHIVO")"
VOLUMEN="${PROYECTO}_datos-soporte"
IMAGEN_AUX="alpine:3.22"

# Se trabaja sobre una copia del archivo elegido, así nada de lo que sigue puede cambiarlo.
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT
cp "$ARCHIVO" "$TEMPORAL/restaurar.db"

echo "==> Copia de la base actual antes de restaurar"
"$(dirname "$0")/respaldo.sh" "$PROYECTO" "$CARPETA" antes-de-restaurar

echo "==> Deteniendo $PROYECTO (web y backend)"
docker stop "$PROYECTO-web-1" "$PROYECTO-backend-1" > /dev/null
# El usuario "node" de la imagen del backend tiene UID 1000.
docker run --rm -v "$VOLUMEN:/data" -v "$TEMPORAL:/respaldo:ro" "$IMAGEN_AUX" sh -c \
  "rm -f /data/soporte.db-wal /data/soporte.db-shm && cp /respaldo/restaurar.db /data/soporte.db && chown 1000:1000 /data/soporte.db"
docker start "$PROYECTO-backend-1" "$PROYECTO-web-1" > /dev/null

echo "==> Esperando el healthcheck"
for _ in $(seq 1 40); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$PROYECTO-web-1")" == "healthy" ]] && { echo "==> $PROYECTO restaurado desde $NOMBRE"; exit 0; }
  sleep 3
done
echo "El sistema no quedó sano en 2 minutos: revise docker logs $PROYECTO-backend-1" >&2
exit 1
