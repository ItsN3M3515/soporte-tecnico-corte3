#!/usr/bin/env bash
# Funciones compartidas por los scripts de seguridad. Se usan igual en local y en el pipeline.
# Versiones fijas de las herramientas: Dependabot no las ve, se actualizan aquí a mano.
TRIVY_IMAGEN="${TRIVY_IMAGEN:-aquasec/trivy:0.76.2}"
GITLEAKS_IMAGEN="${GITLEAKS_IMAGEN:-zricethezav/gitleaks:v8.30.1}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Git Bash en Windows: rutas al estilo C:/... para los volúmenes de Docker
if pwd -W > /dev/null 2>&1; then
  export MSYS_NO_PATHCONV=1
  RAIZ="$(cd "$RAIZ" && pwd -W)"
fi
mkdir -p "$RAIZ/reportes"
