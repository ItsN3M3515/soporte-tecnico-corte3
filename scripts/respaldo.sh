#!/usr/bin/env bash
# Copia de seguridad de la base de datos (SQLite) de un entorno desplegado, sin detener el sistema.
# Usa "VACUUM INTO" de SQLite dentro del contenedor: copia consistente aunque haya escrituras en curso
# (copiar soporte.db a mano puede dejar fuera lo que aún está en soporte.db-wal).
#
# Uso: scripts/respaldo.sh <proyecto> [carpeta] [sufijo]
#   proyecto: asistec-produccion | asistec-pruebas | asistec (docker compose local)
#   carpeta:  dónde dejar el archivo (por defecto /opt/asistec/respaldos)
#   sufijo:   se agrega al nombre (lo usa restaurar.sh: "antes-de-restaurar")
# Resultado: <carpeta>/<proyecto>-AAAAMMDD-HHMMSS[-sufijo].db
set -euo pipefail
PROYECTO="${1:?Uso: scripts/respaldo.sh <proyecto> [carpeta]   (ej. asistec-produccion)}"
CARPETA="${2:-/opt/asistec/respaldos}"
CONTENEDOR="$PROYECTO-backend-1"
SUFIJO="${3:+-$3}"
ARCHIVO="$CARPETA/$PROYECTO-$(date -u +%Y%m%d-%H%M%S)$SUFIJO.db"
TEMPORAL="/data/respaldo-$$.db"

docker inspect "$CONTENEDOR" > /dev/null 2>&1 || { echo "No existe el contenedor $CONTENEDOR (¿el proyecto está desplegado?)" >&2; exit 1; }
mkdir -p "$CARPETA"
docker exec "$CONTENEDOR" node -e \
  "new (require('node:sqlite').DatabaseSync)('/data/soporte.db').exec(\"VACUUM INTO '$TEMPORAL'\")"
docker cp "$CONTENEDOR:$TEMPORAL" "$ARCHIVO"
docker exec "$CONTENEDOR" rm -f "$TEMPORAL"
echo "==> Copia de seguridad: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
