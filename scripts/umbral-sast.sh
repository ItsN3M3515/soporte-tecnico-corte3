#!/usr/bin/env bash
# Quality gate de SAST. CodeQL publica sus hallazgos pero nunca hace fallar el job:
# este script lee el SARIF y falla si hay algún hallazgo ALTO o CRÍTICO sin tratar.
#   Umbral: security-severity >= 7.0 (escala CVSS de CodeQL: 7.0-8.9 alto, 9.0+ crítico).
#   Un hallazgo está "tratado" si aparece en .github/codeql/excepciones-sast.txt
#   y tiene su registro en docs/seguridad.md (falso positivo o riesgo aceptado).
# Uso: scripts/umbral-sast.sh <archivo.sarif> [...]
set -euo pipefail
cd "$(dirname "$0")/.."
UMBRAL="7.0"
EXCEPCIONES=".github/codeql/excepciones-sast.txt"
[[ $# -gt 0 ]] || { echo "Uso: scripts/umbral-sast.sh <archivo.sarif> [...]" >&2; exit 2; }

excepciones='[]'
if [[ -f "$EXCEPCIONES" ]]; then
  excepciones="$({ grep -vE '^[[:space:]]*(#|$)' "$EXCEPCIONES" || true; } \
    | awk '{print $1" "$2}' \
    | jq -R -s 'split("\n") | map(select(length > 0) | split(" ") | {regla: .[0], archivo: .[1]})')"
fi

hallazgos="$(jq -s --argjson umbral "$UMBRAL" --argjson excepciones "$excepciones" '
  [ .[].runs[] as $run
    | ([$run.tool.driver.rules[]?, $run.tool.extensions[]?.rules[]?]
        | map({key: .id, value: ((.properties["security-severity"] // "0") | tonumber)})
        | from_entries) as $severidad
    | $run.results[]?
    | { regla: .ruleId,
        severidad: ($severidad[.ruleId] // 0),
        archivo: .locations[0].physicalLocation.artifactLocation.uri,
        linea: .locations[0].physicalLocation.region.startLine,
        mensaje: .message.text }
    | select(.severidad >= $umbral)
    | . as $h
    | .tratado = any($excepciones[]; .regla == $h.regla and .archivo == $h.archivo)
  ]' "$@")"

echo "==> Hallazgos de SAST con severidad >= $UMBRAL"
jq -r '.[] | "  [\(if .tratado then "tratado" else "PENDIENTE" end)] \(.severidad) \(.regla) \(.archivo):\(.linea) \(.mensaje)"' <<< "$hallazgos"
pendientes="$(jq '[.[] | select(.tratado | not)] | length' <<< "$hallazgos")"
echo "==> $(jq length <<< "$hallazgos") hallazgo(s) altos o críticos, $pendientes sin tratar"
if [[ "$pendientes" -gt 0 ]]; then
  echo "QUALITY GATE DE SAST FALLIDO: corrija los hallazgos o regístrelos en docs/seguridad.md" >&2
  exit 1
fi
