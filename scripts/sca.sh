#!/usr/bin/env bash
# Quality gate de SCA: librerías con vulnerabilidades conocidas (CVE) en los package-lock.json
# del backend, la app y las pruebas e2e.
#   Umbral (enunciado): ninguna vulnerabilidad ALTA o CRÍTICA con corrección disponible.
#   Excepciones: .trivyignore, cada una registrada en docs/seguridad.md.
# Uso: scripts/sca.sh
set -euo pipefail
source "$(dirname "$0")/comun.sh"
trivy() {
  docker run --rm -v "$RAIZ:/src" -v trivy-cache:/root/.cache "$TRIVY_IMAGEN" \
    fs --scanners vuln --skip-dirs '**/node_modules' --ignorefile /src/.trivyignore "$@" /src
}
echo "==> Reporte completo: reportes/trivy-dependencias.json"
trivy --quiet --format json --output /src/reportes/trivy-dependencias.json
echo "==> Quality gate: HIGH o CRITICAL con corrección disponible"
trivy --quiet --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1
