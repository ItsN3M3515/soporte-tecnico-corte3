#!/usr/bin/env bash
# Quality gate de secretos: contraseñas, tokens y llaves en el código Y en todo el historial de Git.
#   Umbral (enunciado): cero secretos. Los falsos positivos se marcan en .gitleaks.toml
#   (allowlist), cada uno registrado en docs/seguridad.md.
# Uso: scripts/secretos.sh   (necesita el historial completo: git clone sin --depth)
set -euo pipefail
source "$(dirname "$0")/comun.sh"
docker run --rm -v "$RAIZ:/repo" -w /repo "$GITLEAKS_IMAGEN" git /repo \
  --config /repo/.gitleaks.toml --redact --verbose --exit-code 1 \
  --report-format json --report-path /repo/reportes/gitleaks.json
