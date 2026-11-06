#!/usr/bin/env bash
# SBOM (lista de componentes) de una imagen en formato CycloneDX. No detiene el pipeline:
# deja registro de qué quedó dentro de cada versión.
# Uso: scripts/sbom.sh <imagen:tag> [nombre]
set -euo pipefail
IMAGEN="${1:?Uso: scripts/sbom.sh <imagen:tag> [nombre]}"
NOMBRE="${2:-imagen}"
source "$(dirname "$0")/comun.sh"
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$RAIZ:/src" -v trivy-cache:/root/.cache \
  "$TRIVY_IMAGEN" image --quiet --format cyclonedx --output "/src/reportes/sbom-$NOMBRE.cdx.json" "$IMAGEN"
echo "==> SBOM: reportes/sbom-$NOMBRE.cdx.json"
