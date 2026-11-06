#!/usr/bin/env bash
# Reversión: vuelve a desplegar una versión anterior que ya está en GHCR (no reconstruye nada).
# Uso: scripts/rollback.sh <pruebas|produccion> [etiqueta]
#   Sin etiqueta, usa la que quedó en $ASISTEC_HOME/<entorno>/version-anterior.
# La usa rollback.yml (a mano) y cd.yml (automática si falla la prueba de humo en producción).
set -euo pipefail
ENTORNO="${1:?Uso: scripts/rollback.sh <pruebas|produccion> [etiqueta]}"
DIR="${ASISTEC_HOME:-/opt/asistec}/$ENTORNO"
ETIQUETA="${2:-$(cat "$DIR/version-anterior" 2>/dev/null || true)}"
[[ -n "$ETIQUETA" ]] || { echo "No hay versión anterior registrada en $DIR/version-anterior; indique la etiqueta." >&2; exit 1; }
ACTUAL="$(cat "$DIR/version-actual" 2>/dev/null || echo ninguna)"
echo "==> Reversión de $ENTORNO: $ACTUAL -> $ETIQUETA"
"$(dirname "$0")/deploy.sh" "$ENTORNO" "$ETIQUETA"
echo "$(date -u +%FT%TZ) $ENTORNO reversion $ACTUAL -> $ETIQUETA" >> "$DIR/historial.log"
