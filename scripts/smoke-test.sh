#!/usr/bin/env bash
# Prueba de humo: comprueba que el flujo principal del sistema desplegado responde.
# Uso: scripts/smoke-test.sh <url-base> [completo|lectura]
#   completo (pruebas):     salud → app web → login → escanear QR → crear solicitud → asignada → seguimiento
#   lectura  (produccion):  salud → app web → login → escanear QR → mis solicitudes (no crea datos)
# Si el entorno se está iniciando, espera hasta 2 minutos a que el healthcheck responda.
# Cuenta y equipo de la prueba (variables opcionales; por defecto, los datos de demostración):
#   HUMO_USUARIO / HUMO_CLAVE  cuenta DOCENTE o ESTUDIANTE que inicia sesión (docente / docente123)
#   HUMO_QR                    texto de un QR registrado (SOPORTE:v1:CAM-K-101-VB01)
# En producción, después de retirar las cuentas de demostración, se definen como variable y secreto
# del repositorio (docs/implementacion.md §5.7); si no, la prueba fallaría y revertiría cada despliegue.
# Termina con error (y hace fallar el pipeline) en el primer paso que no cumpla.
set -euo pipefail
URL="${1:?Uso: scripts/smoke-test.sh <url-base> [completo|lectura]}"; URL="${URL%/}"
MODO="${2:-completo}"
QR="${HUMO_QR:-SOPORTE:v1:CAM-K-101-VB01}"   # por defecto: video beam del salón 101, Edificio K
EQUIPO="${QR##*:}"
USUARIO="${HUMO_USUARIO:-docente}"
CLAVE="${HUMO_CLAVE:-docente123}"
# Reintentos ante errores de conexión (TLS o red cortada en el túnel de Tailscale Funnel) y ante
# 502/503/504 transitorios: el 2026-11-06 un SSL_ERROR_SYSCALL aislado en el paso 5 hizo fallar la
# prueba y revirtió producción sin que la aplicación fallara. Sin --fail, una respuesta HTTP como
# 400, 401 o 403 no es un error de curl: NO se reintenta y el paso la evalúa de inmediato.
CURL=(curl --silent --show-error --max-time 15 --retry 3 --retry-delay 3 --retry-all-errors)

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

paso "3. Una docente inicia sesión ($USUARIO)"
TOKEN="$("${CURL[@]}" -X POST "$URL/api/auth/login" -H 'Content-Type: application/json' \
  -d "$(jq -cn --arg u "$USUARIO" --arg c "$CLAVE" '{usuario: $u, clave: $c}')" | jq -r '.token // empty')"
[[ -n "$TOKEN" ]] || falla "POST /api/auth/login no devolvió un token para $USUARIO"
ok
AUTH=(-H "Authorization: Bearer $TOKEN")

paso "4. Sin token, la API responde 401"
codigo="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$URL/api/solicitudes/mias")"
[[ "$codigo" == "401" ]] || falla "GET /api/solicitudes/mias sin token respondió $codigo"
ok

paso "5. Escanear el QR muestra el equipo y sus problemas"
equipo="$("${CURL[@]}" "${AUTH[@]}" --get --data-urlencode "qr=$QR" "$URL/api/qr/resolver")"
[[ "$(jq -r '.codigo // empty' <<< "$equipo")" == "$EQUIPO" ]] || falla "GET /api/qr/resolver no resolvió el equipo $EQUIPO: $equipo"
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
  # Responde {activas: [...], historial: [...]}
  n="$("${CURL[@]}" "${AUTH[@]}" "$URL/api/solicitudes/mias" | jq -r '(.activas | length) + (.historial | length)')" || falla "GET /api/solicitudes/mias falló"
  [[ "$n" =~ ^[0-9]+$ ]] || falla "GET /api/solicitudes/mias no devolvió las listas activas e historial"
  ok "$n solicitudes"
fi
echo "==> Prueba de humo superada"
