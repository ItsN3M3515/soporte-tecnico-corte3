#!/usr/bin/env bash
# Verifica el SLO del Corte 2 contra un entorno desplegado con k6 (perf/scripts/slo.js).
# Uso: scripts/slo.sh <url-base> [duración]          ej. scripts/slo.sh https://<host>:8443 30s
# Antes de medir espera a que el healthcheck responda: si el entorno acaba de arrancar,
# los primeros segundos no cuentan contra el SLO.
set -euo pipefail
URL="${1:?Uso: scripts/slo.sh <url-base> [duración]}"; URL="${URL%/}"
DURACION="${2:-30s}"
cd "$(dirname "$0")/.."
mkdir -p reportes

echo "==> Esperando el healthcheck de $URL"
for i in $(seq 1 24); do
  curl -sf --max-time 10 "$URL/api/salud" > /dev/null && break
  [[ $i -eq 24 ]] && { echo "El entorno no respondió en 2 minutos" >&2; exit 1; }
  sleep 5
done

# Calentamiento: unas peticiones para que la primera conexión TLS no cuente en el p95
for _ in 1 2 3; do curl -s -o /dev/null --max-time 10 "$URL/api/salud"; done

echo "==> Prueba de carga corta ($DURACION) con los umbrales del SLO"
k6 run --quiet -e API_URL="$URL/api" -e DURACION="$DURACION" -e RESUMEN=reportes/slo-resumen.json perf/scripts/slo.js
