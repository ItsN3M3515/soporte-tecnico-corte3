#!/usr/bin/env bash
# Quality gate de la imagen: vulnerabilidades del sistema operativo y de las librerías DENTRO del contenedor.
#   Umbral (más estricto que el enunciado, ver ADR de seguridad): ninguna vulnerabilidad
#   ALTA o CRÍTICA con corrección disponible. El enunciado solo exige CRÍTICA.
# Uso: scripts/escaneo-imagen.sh <imagen:tag> [nombre-del-reporte]
set -euo pipefail
IMAGEN="${1:?Uso: scripts/escaneo-imagen.sh <imagen:tag> [nombre]}"
NOMBRE="${2:-imagen}"
source "$(dirname "$0")/comun.sh"
trivy() {
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$RAIZ:/src" -v trivy-cache:/root/.cache \
    "$TRIVY_IMAGEN" image --scanners vuln --ignorefile /src/.trivyignore "$@" "$IMAGEN"
}
echo "==> Reporte completo: reportes/trivy-$NOMBRE.json"
trivy --quiet --format json --output "/src/reportes/trivy-$NOMBRE.json"
echo "==> Quality gate: HIGH o CRITICAL con corrección disponible"
trivy --quiet --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1
