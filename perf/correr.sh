#!/usr/bin/env bash
# Ejecuta una prueba de carga contra un servidor limpio (BD nueva).
# Uso:  bash perf/correr.sh baseline|pico|estres
# Requiere: k6 instalado y el backend con dependencias (cd backend && npm install).
set -euo pipefail
PRUEBA=${1:?"Indique baseline, pico o estres"}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
BD=$(mktemp -d)/soporte.db
# Secreto aleatorio por ejecución: el servidor no arranca sin JWT_SECRET
JWT_SECRET=${JWT_SECRET:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")} \
DB_PATH=$BD PORT=3000 node --disable-warning=ExperimentalWarning "$RAIZ/backend/src/server.js" > "$RAIZ/perf/resultados/$PRUEBA-servidor.log" 2>&1 &
PID=$!
trap 'kill $PID' EXIT
# Espera a que el backend responda (hasta 30 s) en vez de un tiempo fijo
for _ in $(seq 1 60); do
  curl -sf http://localhost:3000/api/salud > /dev/null 2>&1 && break
  sleep 0.5
done
K6_NO_USAGE_REPORT=true k6 run \
  --summary-export "$RAIZ/perf/resultados/$PRUEBA-resumen.json" \
  --out csv="$RAIZ/perf/resultados/$PRUEBA.csv" \
  "$RAIZ/perf/scripts/$PRUEBA.js" | tee "$RAIZ/perf/resultados/$PRUEBA-consola.txt" \
  || echo "k6 terminó con umbrales incumplidos (esperado en la prueba de estrés)"
python3 "$RAIZ/perf/analizar_csv.py" "$RAIZ/perf/resultados/$PRUEBA.csv" > "$RAIZ/perf/resultados/$PRUEBA-ventanas.md" || true
