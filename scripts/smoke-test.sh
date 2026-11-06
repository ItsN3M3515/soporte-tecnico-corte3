#!/usr/bin/env bash
# Prueba de humo: comprueba que el flujo principal del sistema desplegado responde.
# Uso: scripts/smoke-test.sh <url-base> [completo|lectura]
#   completo (pruebas):     salud → app web → login → escanear QR → crear solicitud → asignada → seguimiento
#   lectura  (produccion):  salud → app web → login → escanear QR → mis solicitudes (no crea datos)
# Si el entorno se está iniciando, espera hasta 2 minutos a que el healthcheck responda.
# Termina con error (y hace fallar el pipeline) en el primer paso que no cumpla.
set -euo pipefail
URL="${1:?Uso: scripts/smoke-test.sh <url-base> [completo|lectura]}"; URL="${URL%/}"
MODO="${2:-completo}"
QR="SOPORTE:v1:CAM-K-101-VB01"   # video beam del salón 101, Edificio K (datos de demostración)
CURL=(curl --silent --show-error --max-time 15)

paso() { printf '  %-68s' "$1"; }
ok()   { echo "OK${1:+ ($1)}"; }
falla(){ echo "FALLA"; echo "PRUEBA DE HUMO FALLIDA: $1" >&2; exit 1; }

echo "==> Prueba de humo ($MODO) contra $URL"

paso "1. El healthcheck responde (espera hasta 120 s)"
for i in $(seq 1 24); do
  if [[ "$("${CURL[@]}" "$URL/api/salud" 2>/dev/null || true)" == *'"ok"'* ]]; then break; fi
  [[ $i -eq 24 ]] && falla "GET /api/salud no respondió {estado: ok}"
  sleep 5
done
ok

paso "2. La app web carga"
html="$("${CURL[@]}" "$URL/")" || falla "GET / no respondió"
[[ "$html" == *'<div id="root"'* ]] || falla "GET / no devolvió la app"
ok

paso "3. Una docente inicia sesión"
TOKEN="$("${CURL[@]}" -X POST "$URL/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"usuario":"docente","clave":"docente123"}' | jq -r '.token // empty')"
[[ -n "$TOKEN" ]] || falla "POST /api/auth/login no devolvió un token"
ok
AUTH=(-H "Authorization: Bearer $TOKEN")

paso "4. Sin token, la API responde 401"
codigo="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$URL/api/solicitudes/mias")"
[[ "$codigo" == "401" ]] || falla "GET /api/solicitudes/mias sin token respondió $codigo"
ok

paso "5. Escanear el QR muestra el equipo y sus problemas"
equipo="$("${CURL[@]}" "${AUTH[@]}" --get --data-urlencode "qr=$QR" "$URL/api/qr/resolver")"
[[ "$(jq -r '.salon // empty' <<< "$equipo")" == "101" ]] || falla "GET /api/qr/resolver no resolvió el salón 101: $equipo"
ok "$(jq -r '"Salón \(.salon) · \(.edificio)"' <<< "$equipo")"

if [[ "$MODO" == "completo" ]]; then
  paso "6. Reportar la falla crea la solicitud y la asigna a un técnico"
  sol="$("${CURL[@]}" "${AUTH[@]}" -X POST "$URL/api/solicitudes" -H 'Content-Type: application/json' \
    -d "{\"qr\":\"$QR\",\"tipo\":\"FALLA_EQUIPO_FIJO\",\"claseEnCurso\":true,\"datos\":{\"problema\":\"SIN_IMAGEN\",\"descripcion\":\"prueba de humo\"}}")"
  ID="$(jq -r '.id // empty' <<< "$sol")"
  [[ -n "$ID" && "$(jq -r '.estado' <<< "$sol")" == "ASIGNADA" ]] || falla "POST /api/solicitudes no quedó ASIGNADA: $sol"
  ok "$(jq -r '"\(.estado) a \(.tecnicoNombre)"' <<< "$sol")"

  paso "7. La docente ve el seguimiento de su solicitud"
  estado="$("${CURL[@]}" "${AUTH[@]}" "$URL/api/solicitudes/$ID" | jq -r '.estado // empty')"
  [[ -n "$estado" ]] || falla "GET /api/solicitudes/$ID no devolvió el estado"
  ok "$estado"
else
  paso "6. La docente consulta sus solicitudes"
  n="$("${CURL[@]}" "${AUTH[@]}" "$URL/api/solicitudes/mias" | jq -r 'length')" || falla "GET /api/solicitudes/mias falló"
  [[ "$n" =~ ^[0-9]+$ ]] || falla "GET /api/solicitudes/mias no devolvió una lista"
  ok "$n solicitudes"
fi
echo "==> Prueba de humo superada"
