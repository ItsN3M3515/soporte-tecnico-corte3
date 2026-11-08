# Guía de implementación de AsisTec

**Para el equipo técnico de la organización** (en el caso del Corte 1: la Coordinación de Soporte Técnico de la universidad). Supone que conoce Docker y Git, pero no el proyecto. Cada paso dice el comando o la acción exacta y el resultado esperado.

**Convenciones**

- Los valores que usted cambia van entre `<` y `>`: por ejemplo `<organización>` es el nombre de su organización en GitHub. **No escriba los signos `<` `>`.**
- Los comandos son para un servidor Linux (Debian 12/13 o Ubuntu 24.04) con `bash`. Los que empiezan con `gh` también funcionan desde su computador.
- Los nombres de servicios, variables, scripts y workflows son los del repositorio: `docker-compose.yml`, `.env.example`, `scripts/` y `.github/workflows/`.

**Contenido:** [1. Qué se va a implementar](#1-qué-se-va-a-implementar) · [2. Requisitos previos](#2-requisitos-previos) · [3. Costos estimados](#3-costos-estimados) · [4. Configuración](#4-configuración) · [5. Instalación paso a paso](#5-instalación-paso-a-paso) · [6. Verificación](#6-verificación) · [7. Operación](#7-operación) · [8. Solución de problemas](#8-solución-de-problemas) · [9. Recomendaciones para producción](#9-recomendaciones-para-producción)

---

## 1. Qué se va a implementar

AsisTec reemplaza la llamada telefónica de soporte por **un código QR en cada equipo del aula**. El docente (o estudiante) lo escanea con el celular o el navegador, elige qué le pasa al equipo y la solicitud se asigna sola al técnico libre más cercano de su sede. El técnico la ve aparecer sin recargar, el docente sigue el avance en tiempo real y el coordinador ve el día, las solicitudes escaladas y la demanda por sede, y puede asignar a mano.

Se instalan dos contenedores y, opcionalmente, dos de observabilidad:

| Componente | Imagen | Qué hace |
|---|---|---|
| `web` | `ghcr.io/<organización>/asistec-web` (nginx sin root) | Sirve la aplicación web y pasa `/api` y `/socket.io` al backend. Es lo único que se publica |
| `backend` | `ghcr.io/<organización>/asistec-backend` (Node.js 22) | API, tiempo real (Socket.IO), escalación automática y base de datos SQLite en el volumen `datos-soporte` |
| `prometheus`, `grafana` (opcional) | `prom/prometheus:v3.16.0`, `grafana/grafana:13.3.0` | Métricas y tablero del objetivo de servicio (SLO) |

Un pipeline de GitHub Actions construye, prueba y escanea cada cambio, publica las imágenes en GitHub Container Registry (GHCR) y las despliega en su servidor mediante un **runner autohospedado**: primero en un entorno de **pruebas** y, si pasa todo, en **producción**. Diagrama: [vista de despliegue (arquitectura.md §8)](arquitectura.md#8-vista-de-despliegue-corte-3). El pipeline completo: [devops.md](devops.md).

## 2. Requisitos previos

### 2.1 Cuentas y servicios

| Qué | Para qué | Nota |
|---|---|---|
| Cuenta u organización de **GitHub** con permisos de administrador del repositorio | Repositorio, Actions, Environments, Secrets, ruleset | Repositorio **público**: Actions y GHCR sin costo. Privado: ver costos (§3) |
| **GitHub Container Registry** (GHCR) | Guardar las imágenes | Viene con GitHub; no hay que crear nada |
| **Un servidor Linux** (VM en la nube o en el centro de datos) con salida a Internet | Ejecutar los contenedores y el runner | El runner abre una conexión **saliente** a GitHub; no necesita puertos de entrada para desplegar |
| **HTTPS** para la URL pública, una de dos: | | |
| a) Dominio propio (`asistec.<dominio>`) y un proxy con certificado (se usa Caddy, que lo obtiene solo) | Recomendado para producción | Registro DNS tipo A hacia la IP pública del servidor; puertos 80 y 443 abiertos |
| b) Tailscale Funnel (lo que usó el proyecto) | Sin dominio ni IP pública | Cuenta de Tailscale con HTTPS y Funnel habilitados en la consola de administración |

### 2.2 Software y versiones

| Software | Versión | Dónde | Cómo comprobarlo |
|---|---|---|---|
| Docker Engine | 24 o superior (probado con 26 a 29) | Servidor | `docker --version` |
| Docker Compose (plugin) | v2.20 o superior (usa `up --wait --wait-timeout`) | Servidor | `docker compose version` |
| Git, curl, jq, openssl | Los de la distribución (jq ≥ 1.6) | Servidor y su computador | `jq --version` |
| Runner de GitHub Actions | El que ofrezca GitHub al registrarlo (probado con 2.338) | Servidor | Settings → Actions → Runners |
| GitHub CLI `gh` (opcional, recomendado) | 2.40 o superior | Su computador | `gh --version` |
| Caddy (opción a) | 2.6 o superior | Servidor | `caddy version` |
| Tailscale (opción b) | 1.60 o superior | Servidor | `tailscale version` |

No hace falta instalar Node.js en el servidor: todo corre en contenedores. Para generar los QR (§5.6) se usa un contenedor de Node.

### 2.3 Recursos mínimos del servidor

| Recurso | Mínimo | Usado en el proyecto | Recomendado para la universidad |
|---|---|---|---|
| CPU | 2 vCPU | 2 vCPU | 2 vCPU |
| Memoria | 2 GiB (3 GiB con observabilidad) | 3 GiB (≈1 GiB ocupado con pruebas + producción + observabilidad) | 4 GiB |
| Disco | 20 GB | 30 GB | 40 GB + copias de seguridad fuera del servidor |

### 2.4 Puertos

| Puerto | Servicio | Expuesto a |
|---|---|---|
| 443 (y 80 para el certificado) | Caddy o Tailscale → `web` | Internet |
| 8080 | `web` de producción (`WEB_PORT`) | Solo el proxy (bloquéelo desde Internet en el firewall del proveedor) |
| 8081 | `web` de pruebas | Solo el proxy |
| 3000 / 3001 | `backend` de producción / pruebas (`BACKEND_PORT`) | Solo `127.0.0.1` (ya viene así) |
| 3002 | Grafana (`GRAFANA_PORT`) | Solo `127.0.0.1`; ábralo solo en la red interna |
| 22 | SSH de administración | Su red de administración |

## 3. Costos estimados

Precios de lista de referencia, aproximados, en dólares por mes; verifíquelos con el proveedor antes de contratar. El tamaño recomendado parte de 2 sedes, 4 a 10 técnicos y unos cientos de solicitudes por día; la prueba de estrés del proyecto mostró que un solo servidor aguanta ≈140 solicitudes por segundo.

| Componente | Plan usado en el proyecto | Costo | Plan recomendado para el negocio | Costo aprox. |
|---|---|---|---|---|
| Servidor | VM de 2 vCPU y 3 GiB en un servidor que el equipo ya tenía | US$ 0 de nube (electricidad estimada en US$ 3 a 8) | VM de 2 vCPU y 4 GiB: en el centro de datos de la universidad, o en la nube (por ejemplo Hetzner CX22, DigitalOcean Basic 4 GB, Azure B2s) | US$ 0 marginal en el centro de datos; US$ 5 a 35 en la nube según el proveedor |
| Copias de seguridad | Manuales | US$ 0 | Copia diaria fuera del servidor: snapshots del proveedor o almacenamiento de objetos | US$ 1 a 5 |
| GitHub (repositorio, Actions, GHCR) | Free, repositorio público | US$ 0 | Público: Free. Privado: Team (US$ 4 por usuario), con 3.000 minutos de Actions y 2 GB de paquetes incluidos; cada fusión a `main` usa ≈ 25 minutos | US$ 0 a 20 (equipo de 5) |
| Runner autohospedado | En la misma VM | US$ 0 | En la misma VM (no consume minutos de GitHub) | US$ 0 |
| HTTPS / dominio | Tailscale Funnel (plan Personal) y `*.ts.net` | US$ 0 | Subdominio institucional (`asistec.<dominio-universidad>`) con Caddy y certificado gratuito de Let's Encrypt | US$ 0 (o ≈ US$ 1 si se compra un dominio: ≈ US$ 12 al año) |
| Observabilidad | Prometheus + Grafana en la misma VM | US$ 0 | Igual | US$ 0 |
| **Total mensual** | | **≈ US$ 0 a 8** | | **≈ US$ 1 a 60** (≈ US$ 1 a 5 en el centro de datos de la universidad) |

## 4. Configuración

Todas las variables del sistema. Las del archivo `.env` vienen de `.env.example` en la raíz del repositorio; en el servidor el pipeline escribe el `.env` de cada entorno desde GitHub Secrets (`scripts/escribir-env.sh`).

### 4.1 Variables de entorno (`.env`)

| Variable | Para qué sirve | Valor de ejemplo | ¿Obligatoria? | Dónde se configura | Cómo generar el valor |
|---|---|---|---|---|---|
| `JWT_SECRET` | Firma las sesiones (JWT). Sin ella el backend no arranca y Compose se detiene | `9f2c…` (64 caracteres hexadecimales) | **Sí**, mínimo 32 caracteres en el servidor | Local: `.env`. Servidor: GitHub Secrets, environments `pruebas` y `produccion` (un valor distinto en cada uno) | `openssl rand -hex 32` |
| `MINUTOS_SIN_RESPUESTA` | Minutos que tiene un técnico para aceptar antes de reasignar | `5` | No (5) | `.env` | — |
| `MINUTOS_EN_COLA` | Minutos en cola sin técnico antes de escalar al coordinador | `10` | No (10) | `.env` | — |
| `INTERVALO_ESCALACION_MS` | Cada cuánto revisa el programador de escalación | `30000` | No (30000) | `.env` | — |
| `WEB_PORT` | Puerto de la máquina para la app web y la API | `8080` | No (8080) | Local: `.env`. Servidor: lo fija el pipeline (8080 producción, 8081 pruebas) | — |
| `BACKEND_PORT` | Puerto de la API directa, solo en `127.0.0.1` | `3000` | No (3000) | Local: `.env`. Servidor: el pipeline (3000 / 3001) | — |
| `COMPOSE_PROFILES` | `observabilidad` enciende Prometheus y Grafana | `observabilidad` | No | Local: `.env`. Servidor: el pipeline la agrega en producción si existe `GRAFANA_ADMIN_PASSWORD` | — |
| `GRAFANA_ADMIN_PASSWORD` | Clave del usuario `admin` de Grafana (se fija la primera vez que arranca Grafana) | `kQ3v…` | Solo con observabilidad | Local: `.env`. Servidor: GitHub Secrets, environment `produccion` | `openssl rand -base64 18` |
| `GRAFANA_PORT` | Puerto de Grafana, solo en `127.0.0.1` | `3002` | No (3002) | `.env` | — |

Las fija la imagen o `docker-compose.yml` y no hace falta cambiarlas: `PORT=3000` y `DB_PATH=/data/soporte.db` (backend), `EXPO_PUBLIC_API_URL=mismo-origen` (la app llama a la API en la misma URL desde la que cargó). `scripts/deploy.sh` usa además `IMAGE_TAG` (la etiqueta a desplegar, la pone el pipeline) y `ASISTEC_HOME` (carpeta de los entornos, por defecto `/opt/asistec`).

### 4.2 GitHub: secretos y variables

| Nombre | Tipo | Dónde | Para qué | Valor |
|---|---|---|---|---|
| `JWT_SECRET` | Secreto | Environment `pruebas` | Firma de sesiones en pruebas | `openssl rand -hex 32` |
| `JWT_SECRET` | Secreto | Environment `produccion` | Firma de sesiones en producción (distinto del de pruebas) | `openssl rand -hex 32` |
| `GRAFANA_ADMIN_PASSWORD` | Secreto | Environment `produccion` | Activa la observabilidad en producción y fija la clave de Grafana | `openssl rand -base64 18` (guárdela en su gestor de claves) |
| `URL_PRUEBAS` | Variable | Repositorio | URL pública de pruebas, sin `/` al final | `https://pruebas.asistec.<dominio>` |
| `URL_PRODUCCION` | Variable | Repositorio | URL pública de producción, sin `/` al final | `https://asistec.<dominio>` |
| `HUMO_USUARIO` | Variable | Repositorio | Cuenta con la que la prueba de humo de producción inicia sesión (§5.7). Vacía: la cuenta de demostración `docente` | `monitor.humo` |
| `HUMO_CLAVE` | Secreto | Repositorio | Clave de esa cuenta | La que usted elija al crearla (§5.7) |
| `HUMO_QR` | Variable | Repositorio | QR de un equipo real para la prueba de humo, si cambió los datos iniciales. Vacía: `SOPORTE:v1:CAM-K-101-VB01` | `SOPORTE:v1:<código-del-equipo>` |
| `GITHUB_TOKEN` | Automático | — | Publicar y descargar imágenes de GHCR, crear Releases | GitHub lo crea en cada ejecución |

## 5. Instalación paso a paso

### 5.1 Preparar el servidor

En el servidor, con un usuario que tenga `sudo`:

1. Instale Docker (script oficial) y las herramientas:

   ```bash
   sudo apt-get update && sudo apt-get install -y git curl jq openssl
   curl -fsSL https://get.docker.com | sudo sh
   docker compose version
   ```

   **Resultado esperado:** `Docker Compose version v2.x` (o superior).

2. Cree el usuario que ejecutará el runner y la carpeta de los entornos:

   ```bash
   sudo useradd --create-home --shell /bin/bash runner
   sudo usermod -aG docker runner
   sudo mkdir -p /opt/asistec/respaldos
   sudo chown -R runner:runner /opt/asistec
   sudo -iu runner docker ps
   ```

   **Resultado esperado:** la última línea muestra la cabecera `CONTAINER ID   IMAGE ...` sin error de permisos.

3. En el firewall del proveedor (o del centro de datos) deje entrar solo 22 (desde su red de administración) y, si usa dominio propio, 80 y 443. **Nota:** los puertos que publica Docker no los filtra `ufw`; use el firewall del proveedor o de la red.

### 5.2 Copiar el repositorio a su organización

En su computador (con `git` y `gh` autenticado: `gh auth login`):

```bash
git clone https://github.com/ItsN3M3515/soporte-tecnico-corte3.git asistec
cd asistec
git remote rename origin proyecto
gh repo create <organización>/asistec --public --source . --remote origin --push
```

**Resultado esperado:** `✓ Created repository <organización>/asistec on GitHub` y el código subido a `main`.

Las imágenes se publican con el nombre del dueño del repositorio. Cámbielo en los cinco archivos que lo tienen (el nombre en GHCR va **en minúsculas**):

```bash
grep -rl 'ghcr.io/itsn3m3515' .github deploy k8s | xargs sed -i 's#ghcr.io/itsn3m3515#ghcr.io/<organización-en-minúsculas>#g'
git diff --stat
git commit -am "Imágenes en el registro de la organización"
git push origin main
```

**Resultado esperado:** `git diff --stat` muestra `.github/workflows/cd.yml`, `.github/workflows/k8s.yml`, `deploy/docker-compose.prod.yml`, `k8s/10-backend.yaml` y `k8s/20-web.yaml`. El push a `main` funciona porque todavía no hay reglas (se activan en §5.8). Este push dispara el workflow **CD**, que fallará en "Desplegar en pruebas" hasta terminar §5.3 a §5.5: es normal.

### 5.3 Prueba rápida en el servidor (opcional, 3 minutos)

Comprueba que el servidor puede construir y correr el sistema antes de conectar el pipeline:

```bash
git clone https://github.com/<organización>/asistec.git ~/asistec && cd ~/asistec
cp .env.example .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
docker compose up -d --build --wait
curl -s http://localhost:8080/api/salud
```

**Resultado esperado:** `✔ Container asistec-web-1  Healthy` y luego `{"estado":"ok"}`. Bórrelo antes de seguir, para liberar el puerto 8080: `docker compose down --volumes`.

### 5.4 Registrar el runner autohospedado

1. En GitHub: **Settings → Actions → Runners → New self-hosted runner**, sistema **Linux**, arquitectura **x64**. La página muestra la versión y un **token** de registro (dura una hora).
2. En el servidor, como el usuario `runner` (reemplace `<versión>` y `<token>` por los de la página):

   ```bash
   sudo -iu runner
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -o runner.tar.gz -L https://github.com/actions/runner/releases/download/v<versión>/actions-runner-linux-x64-<versión>.tar.gz
   tar xzf runner.tar.gz
   ./config.sh --url https://github.com/<organización>/asistec --token <token> --name asistec-servidor --labels asistec --unattended
   exit
   cd /home/runner/actions-runner && sudo ./svc.sh install runner && sudo ./svc.sh start
   ```

   **Resultado esperado:** `√ Runner successfully added` y luego `active (running)`. En GitHub, el runner aparece **Idle** con las etiquetas `self-hosted`, `Linux`, `X64` y `asistec`. La etiqueta `asistec` es la que buscan los workflows (`runs-on: [self-hosted, asistec]`).

3. **Settings → Actions → General → Fork pull request workflows:** elija **Require approval for all external contributors**. El runner ejecuta código del repositorio en su servidor; ningún desconocido debe poder lanzar un workflow.

### 5.5 Configurar seguridad del repositorio, environments, secretos y variables

1. **Settings → Code security:** active **Dependency graph** y **Dependabot alerts** (el paso de revisión de dependencias del CI los necesita). En **Code scanning**, deje CodeQL en modo avanzado (no active *Default setup*): el workflow `ci.yml` ya lo ejecuta.

2. Cree los environments y limítelos a `main` y a los tags de versión (con `gh` desde su computador):

   ```bash
   R=<organización>/asistec
   for E in pruebas produccion; do
     gh api -X PUT repos/$R/environments/$E -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
     gh api -X POST repos/$R/environments/$E/deployment-branch-policies -f name=main -f type=branch
     gh api -X POST repos/$R/environments/$E/deployment-branch-policies -f name='v*.*.*' -f type=tag
   done
   ```

   **Resultado esperado:** respuestas JSON con `"name":"pruebas"`, `"name":"main"`… En **Settings → Environments** aparecen los dos, con *Deployment branches and tags: main, v\*.\*.\**. (Equivalente en la web: Settings → Environments → New environment → Deployment branches and tags → Selected branches and tags.)

3. Secretos (un `JWT_SECRET` distinto por entorno) y variables:

   ```bash
   gh secret set JWT_SECRET --env pruebas    --body "$(openssl rand -hex 32)" -R $R
   gh secret set JWT_SECRET --env produccion --body "$(openssl rand -hex 32)" -R $R
   CLAVE_GRAFANA="$(openssl rand -base64 18)"; echo "Clave de Grafana (guárdela): $CLAVE_GRAFANA"
   gh secret set GRAFANA_ADMIN_PASSWORD --env produccion --body "$CLAVE_GRAFANA" -R $R
   gh variable set URL_PRUEBAS    --body "https://<url-de-pruebas>" -R $R
   gh variable set URL_PRODUCCION --body "https://<url-de-produccion>" -R $R
   ```

   **Resultado esperado:** `✓ Set Actions secret JWT_SECRET for <organización>/asistec` (y equivalentes). Las URL son las del paso 4.

4. Publique las URL con HTTPS. **Opción a, dominio propio con Caddy** (recomendada). Cree los registros DNS `asistec.<dominio>` y `pruebas.asistec.<dominio>` hacia la IP del servidor y luego:

   ```bash
   sudo apt-get install -y caddy
   sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
   asistec.<dominio> {
       reverse_proxy 127.0.0.1:8080
   }
   pruebas.asistec.<dominio> {
       reverse_proxy 127.0.0.1:8081
   }
   EOF
   sudo systemctl reload caddy
   ```

   Caddy obtiene y renueva el certificado solo y deja pasar WebSocket (tiempo real) sin configuración extra. Las URL son `https://asistec.<dominio>` y `https://pruebas.asistec.<dominio>`. Antes del primer despliegue responden `502` (todavía no hay nada en 8080): es normal.

   **Opción b, Tailscale Funnel** (como el proyecto): en la consola de Tailscale active *HTTPS Certificates* y *Funnel* para la máquina, y en el servidor:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   sudo tailscale funnel --bg --https=443  http://127.0.0.1:8080
   sudo tailscale funnel --bg --https=8443 http://127.0.0.1:8081
   sudo tailscale serve  --bg --https=3443 http://127.0.0.1:3002
   sudo tailscale funnel status
   ```

   Las URL son `https://<máquina>.<tailnet>.ts.net` (producción) y `https://<máquina>.<tailnet>.ts.net:8443` (pruebas); Grafana queda en `:3443` solo para su red de Tailscale.

### 5.6 Cargar los datos iniciales

En el primer arranque, si la base está vacía, el backend carga los datos de `backend/src/config/datosIniciales.js`: sedes y edificios (`SEDES`), mapa de cercanía entre edificios (`MAPA_CERCANIA`), salones (`SALONES`), tipos de equipo (`TIPOS_EQUIPO`), técnicos (`TECNICOS`) y cuentas (`USUARIOS`). Vienen con datos de demostración (2 sedes, 6 edificios, 61 equipos, 4 técnicos).

1. **Antes del primer despliegue**, reemplace esos datos por los de su organización en `backend/src/config/datosIniciales.js` (los códigos de equipo se generan como `<SEDE>-<EDIFICIO>-<SALÓN>-<EQUIPO>`, por ejemplo `CAM-K-101-VB01`). Súbalo a `main`.
2. Genere los QR para imprimir (solo necesita Docker):

   ```bash
   cd ~/asistec && git pull
   docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/repo -w /repo/backend node:22.22-bookworm-slim sh -c "npm ci && npm run qr"
   ```

   **Resultado esperado:** `61 QR generados en docs/qr/` (o la cantidad de sus equipos). Abra `docs/qr/imprimir.html` en un navegador e imprímalo; cada QR se pega en su equipo. Se imprimen con corrección de errores H: siguen leyéndose con un rayón.
3. Si cambió los equipos, defina el QR que usará la prueba de humo: `gh variable set HUMO_QR --body "SOPORTE:v1:<código-de-un-equipo>" -R $R`.

**Importante:** los datos iniciales solo se cargan con la base vacía. En producción la base persiste entre despliegues, así que cambiar `datosIniciales.js` después del primer despliegue no modifica producción (en pruebas sí, porque su base se borra en cada despliegue).

### 5.7 Primer despliegue, primer coordinador y cuentas de demostración

1. **Primer despliegue:** en GitHub, **Actions → CD → Run workflow** (rama `main`).

   **Resultado esperado** (≈ 7 minutos): todos los jobs en verde, de **CI** a **Prueba de humo (producción)**; **Reversión automática** y **Release** aparecen como omitidos. En el servidor:

   ```bash
   docker compose ls
   ```

   muestra `asistec-pruebas` con `running(2)` y `asistec-produccion` con `running(4)` (web, backend, Prometheus y Grafana).

2. **Cree el coordinador real** en producción. La clave se pide dos veces y no se muestra (mínimo 10 caracteres):

   ```bash
   docker exec -it asistec-produccion-backend-1 node src/adapters/in/cli/usuarios.js crear \
     --usuario <usuario-coordinador> --nombre "<Nombre del coordinador>" --rol ADMIN --correo <correo>
   ```

   **Resultado esperado:** `Usuario creado: <usuario-coordinador> (ADMIN)`. Compruebe que puede iniciar sesión en `https://<url-de-produccion>`.

3. **Cree la cuenta de la prueba de humo y regístrela en GitHub.** La prueba de humo de producción inicia sesión después de cada despliegue; por defecto usa la cuenta de demostración `docente`, que va a retirar en el paso 4. **Haga este paso antes del 4**, o el siguiente despliegue fallará y producción se revertirá sola:

   ```bash
   docker exec -it asistec-produccion-backend-1 node src/adapters/in/cli/usuarios.js crear \
     --usuario monitor.humo --nombre "Monitor de la prueba de humo" --rol DOCENTE --sede <SEDE>
   gh variable set HUMO_USUARIO --body monitor.humo -R $R
   gh secret set HUMO_CLAVE -R $R        # pega la misma clave cuando la pida
   ```

   `<SEDE>` es una de las sedes de los datos iniciales (por ejemplo `CAMPUS`). La prueba de producción es de solo lectura: esta cuenta nunca crea solicitudes.

4. **Retire las cuentas de demostración** y cambie la clave de los técnicos:

   ```bash
   for U in admin docente docente.norte estudiante; do
     docker exec asistec-produccion-backend-1 node src/adapters/in/cli/usuarios.js eliminar --usuario $U
   done
   docker exec -it asistec-produccion-backend-1 node src/adapters/in/cli/usuarios.js clave --usuario <usuario-técnico>
   docker exec asistec-produccion-backend-1 node src/adapters/in/cli/usuarios.js listar
   ```

   **Resultado esperado:** `Usuario eliminado: admin` (y los demás), `Clave cambiada: <usuario-técnico>` y una tabla sin las cuentas retiradas. Repita `clave` con cada técnico (`laura`, `miguel`, `sofia`, `andres` en los datos de demostración, o los suyos). El último coordinador no se puede eliminar, y los técnicos no se eliminan (seguirían recibiendo solicitudes): se les cambia la clave.

   Las demás cuentas (docentes y estudiantes) se crean igual, con `--rol DOCENTE` o `--rol ESTUDIANTE` y `--sede <SEDE>`. Ayuda del comando: `docker exec asistec-produccion-backend-1 node src/adapters/in/cli/usuarios.js ayuda`.

5. Corra el workflow **CD** otra vez (Actions → CD → Run workflow) para confirmar que la prueba de humo pasa con la cuenta nueva.

### 5.8 Proteger la rama principal

**Settings → Rules → Rulesets → New ruleset → New branch ruleset:**

| Campo | Valor |
|---|---|
| Ruleset name | `proteger-main` |
| Enforcement status | Active |
| Bypass list | Vacía (nadie se salta las reglas) |
| Target branches | Include default branch |
| Restrict deletions | ✔ |
| Require a pull request before merging | ✔, *Required approvals* = 1, ✔ *Dismiss stale pull request approvals when new commits are pushed*, ✔ *Require approval of the most recent reviewable push* |
| Require status checks to pass | ✔, agregue los 8: `Construcción`, `Pruebas unitarias y cobertura del dominio`, `Pruebas de integración`, `Reglas de arquitectura`, `SAST (CodeQL)`, `SCA (dependencias con Trivy)`, `Secretos (Gitleaks)`, `Imágenes Docker y escaneo (Trivy)` |
| Block force pushes | ✔ |
| Require code scanning results | ✔, herramienta `CodeQL`, alertas *High or higher* |

**Resultado esperado:** un `git push origin main` desde su computador responde `GH013: Repository rule violations found`. Desde ahora todo cambio entra por pull request. Los checks aparecen en la lista después de que el CI corrió al menos una vez (ya pasó en §5.7).

## 6. Verificación

1. **Healthcheck** de cada entorno:

   ```bash
   curl -s https://<url-de-produccion>/api/salud
   curl -s https://<url-de-pruebas>/api/salud
   ```

   **Resultado esperado:** `{"estado":"ok"}` en los dos.

2. **Prueba de humo**, desde cualquier máquina con `bash`, `curl` y `jq` (en Windows, Git Bash), en la carpeta del repositorio:

   ```bash
   scripts/smoke-test.sh https://<url-de-pruebas> completo
   HUMO_USUARIO=monitor.humo HUMO_CLAVE='<clave>' scripts/smoke-test.sh https://<url-de-produccion> lectura
   ```

   **Resultado esperado:** cada paso con `OK` y al final `==> Prueba de humo superada`. En pruebas el paso 6 dice `OK (ASIGNADA a <técnico>)`: la solicitud se creó y se asignó.

3. **Recorrido por el flujo principal** en el entorno de pruebas (tiene las cuentas de demostración y se borra en cada despliegue):
   1. Abra `https://<url-de-pruebas>` en dos ventanas. En una, inicie sesión como técnico (`laura` / `tecnico123`); en la otra, como docente (`docente` / `docente123`). La pantalla de inicio de sesión tiene botones de "Cuentas de prueba".
   2. Como docente: **Escanear equipo** → **Buscar manualmente por edificio y salón** → Edificio K, salón 101 → **Video Beam** → **No proyecta imagen** → enviar. Si tiene un QR impreso, escanéelo con la cámara en lugar de buscar.
   3. **Esperado:** la confirmación con el número `#S-…` y el seguimiento en "Técnico asignado". En la ventana de Laura la solicitud aparece **sin recargar**.
   4. Laura pulsa **Aceptar**. **Esperado:** el seguimiento de la docente pasa a "Técnico en camino" y le llega una notificación.
4. **Grafana** (si activó la observabilidad): abra `https://<máquina>.<tailnet>.ts.net:3443` (opción b) o `http://127.0.0.1:3002` con un túnel SSH (`ssh -L 3002:127.0.0.1:3002 <usuario>@<servidor>`). **Esperado:** el tablero de AsisTec con p95 de crear solicitud, p95 de la cola, errores y throughput.

## 7. Operación

En el servidor, los contenedores se llaman `<proyecto>-<servicio>-1`, con proyecto `asistec-produccion` o `asistec-pruebas` (por ejemplo `asistec-produccion-backend-1`). Si su usuario no está en el grupo `docker`, anteponga `sudo` o use `sudo -iu runner`.

### 7.1 Publicar una versión nueva

1. Cada cambio entra por un pull request: rama nueva, PR hacia `main`, los 8 checks en verde y la aprobación de otra persona. Al fusionar, el workflow **CD** despliega en pruebas y luego en producción una imagen etiquetada `sha-<commit>`.
2. Para marcar una versión (versionado semántico): agregue lo nuevo en `CHANGELOG.md` dentro del PR y, ya fusionado:

   ```bash
   git switch main && git pull
   git tag -a v<X.Y.Z> -m "v<X.Y.Z>: <resumen>"
   git push origin v<X.Y.Z>
   ```

   **Resultado esperado:** el workflow **CD** corre para el tag, despliega `v<X.Y.Z>` en los dos entornos y el job **Release en GitHub** crea la Release con las notas de los PR (pestaña *Releases*).

### 7.2 Volver a la versión anterior

**Actions → Reversión → Run workflow** → entorno `produccion` → versión (por ejemplo `v1.0.0` o `sha-1a2b3c4`; vacía = la anterior). O con `gh`:

```bash
gh workflow run rollback.yml -R <organización>/asistec -f entorno=produccion -f version=<etiqueta>
gh run watch -R <organización>/asistec
```

**Resultado esperado:** los jobs **Revertir produccion** y **Prueba de humo después de revertir** en verde, en menos de 2 minutos. La versión actual y la anterior quedan en `/opt/asistec/produccion/version-actual` y `version-anterior`, y el evento en `historial.log`. Sin GitHub, en el servidor: `cd ~/asistec && scripts/rollback.sh produccion <etiqueta>`. Detalle: [devops.md §4](devops.md#4-reversión).

### 7.3 Copia de seguridad y restauración

Los datos están en el archivo SQLite `/data/soporte.db` del volumen `asistec-produccion_datos-soporte`.

**Hacer una copia** (sin detener el sistema):

```bash
cd ~/asistec && git pull
scripts/respaldo.sh asistec-produccion /opt/asistec/respaldos
```

**Resultado esperado:** `==> Copia de seguridad: /opt/asistec/respaldos/asistec-produccion-AAAAMMDD-HHMMSS.db (60K)` (el tamaño crece con el uso). Copie ese archivo fuera del servidor (`scp`, almacenamiento de objetos…): una copia en el mismo disco no protege de perder el servidor.

**Restaurar** (detiene web y backend unos segundos; antes guarda la base actual como `…-antes-de-restaurar.db`):

```bash
scripts/restaurar.sh asistec-produccion /opt/asistec/respaldos/<archivo>.db
```

**Resultado esperado:** `==> asistec-produccion restaurado desde <archivo>.db`. Verifique con el healthcheck y la prueba de humo (§6).

**Programarla todos los días** a las 2:00 (como el usuario `runner`):

```bash
sudo -iu runner bash -c '(crontab -l 2>/dev/null; echo "0 2 * * * cd /home/runner/asistec && scripts/respaldo.sh asistec-produccion /opt/asistec/respaldos >> /opt/asistec/respaldos/respaldo.log 2>&1 && find /opt/asistec/respaldos -name \"*.db\" -mtime +30 -delete") | crontab -'
```

Requiere una copia del repositorio en `/home/runner/asistec` (`sudo -iu runner git clone https://github.com/<organización>/asistec.git`). Borra las copias de más de 30 días.

### 7.4 Cambiar un secreto

| Secreto | Cómo | Efecto |
|---|---|---|
| `JWT_SECRET` | `gh secret set JWT_SECRET --env produccion --body "$(openssl rand -hex 32)" -R $R` y luego **Actions → CD → Run workflow** | El despliegue reescribe el `.env` y recrea el backend. Todas las sesiones abiertas se cierran: los usuarios vuelven a iniciar sesión |
| Clave de una cuenta | `docker exec -it asistec-produccion-backend-1 node src/adapters/in/cli/usuarios.js clave --usuario <usuario>` | Inmediato |
| `HUMO_CLAVE` | Primero cambie la clave de `monitor.humo` (fila anterior) y luego `gh secret set HUMO_CLAVE -R $R` | La próxima prueba de humo usa la nueva |
| Clave de Grafana | `docker exec -it asistec-produccion-grafana-1 grafana cli --homepath /usr/share/grafana admin reset-admin-password <clave-nueva>` y actualice `GRAFANA_ADMIN_PASSWORD` en GitHub | Grafana guarda la clave en su base la primera vez que arranca; cambiar solo la variable no la cambia |

### 7.5 Consultar los logs

| Qué | Comando |
|---|---|
| Backend de producción (últimas 100 líneas y en vivo) | `docker logs --tail 100 -f asistec-produccion-backend-1` |
| Todo el entorno | `docker compose -p asistec-produccion logs --tail 100` |
| Estado y salud de los contenedores | `docker compose -p asistec-produccion ps` |
| Despliegues y reversiones en el servidor | `cat /opt/asistec/produccion/historial.log` |
| Runner | `sudo journalctl -u 'actions.runner.*' -n 100` |
| Pipeline | Pestaña **Actions** del repositorio (cada job tiene su registro y sus artefactos) |

### 7.6 Reiniciar un servicio

```bash
docker restart asistec-produccion-backend-1      # solo el backend (las pantallas se reconectan solas)
docker compose -p asistec-produccion restart     # todo el entorno
sudo /home/runner/actions-runner/svc.sh stop && sudo /home/runner/actions-runner/svc.sh start   # el runner
```

**Resultado esperado:** `docker compose -p asistec-produccion ps` muestra los contenedores `Up … (healthy)` en menos de un minuto.

## 8. Solución de problemas

| # | Síntoma | Causa | Solución |
|---|---|---|---|
| 1 | `docker compose up` se detiene con `required variable JWT_SECRET is missing a value: Defina JWT_SECRET (ver .env.example)` | No existe `.env` o le falta `JWT_SECRET` | `cp .env.example .env` y ponga un valor: `sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env` |
| 2 | Los jobs **Desplegar en pruebas** quedan en *Queued*: `Waiting for a runner to pick up this job` | El runner está apagado o desconectado, o no tiene la etiqueta `asistec` | En el servidor: `sudo /home/runner/actions-runner/svc.sh status`. Si está detenido: `sudo /home/runner/actions-runner/svc.sh start`. Revise en Settings → Actions → Runners que esté *Idle* con la etiqueta `asistec`. Los jobs esperan hasta 24 h y luego fallan |
| 3 | El paso "Escribir el .env del entorno" falla con `JWT_SECRET debe tener al menos 32 caracteres` o `Falta JWT_SECRET (configúrelo en el environment …)` | El secreto no está en ese environment, es corto, o se definió como secreto del repositorio en vez del environment | `gh secret set JWT_SECRET --env <pruebas o produccion> --body "$(openssl rand -hex 32)" -R $R` |
| 4 | El despliegue falla con `permission denied while trying to connect to the Docker daemon socket` | El usuario `runner` no está en el grupo `docker`, o el servicio arrancó antes de agregarlo | `sudo usermod -aG docker runner` y reinicie el runner (§7.6) |
| 5 | La prueba de humo de producción falla en el paso 3 (`no devolvió un token para docente`) y producción se revierte sola | Se retiraron las cuentas de demostración sin registrar la cuenta de la prueba de humo | Haga §5.7 paso 3 (cuenta `monitor.humo`, variable `HUMO_USUARIO`, secreto `HUMO_CLAVE`) y vuelva a correr **CD** |
| 6 | La prueba de humo falla en el paso 5 (`no resolvió el equipo CAM-K-101-VB01`) | Cambió los datos iniciales y ese equipo ya no existe | `gh variable set HUMO_QR --body "SOPORTE:v1:<código-de-un-equipo>" -R $R` |
| 7 | `docker compose pull` falla con `denied` o `unauthorized` al bajar de `ghcr.io/…` | El nombre de la imagen no coincide con el dueño del repositorio (§5.2) o el paquete no le da acceso al repositorio | Revise que `deploy/docker-compose.prod.yml` y `cd.yml` digan `ghcr.io/<organización-en-minúsculas>`. En GitHub: *Packages* → `asistec-backend` → *Package settings* → *Manage Actions access*: agregue el repositorio con rol *Read* |
| 8 | `docker compose up` falla con `Bind for 0.0.0.0:8080 failed: port is already allocated` | Otro programa usa el puerto 8080 (por ejemplo la prueba de §5.3 sin borrar) | `docker ps` para ver qué lo usa y deténgalo (`docker compose down` en esa carpeta), o cambie `WEB_PORT` en `.env` |
| 9 | La página carga pero no inicia sesión ni muestra datos (error 502 en `/api`) | El backend no está sano; `web` no tiene a quién pasarle la petición | `docker logs --tail 50 asistec-produccion-backend-1`. Si dice `Falta la variable JWT_SECRET`, ver #3; si es otro error, reinicie (§7.6) o revierta (§7.2) |
| 10 | El job **Prueba de carga del SLO** falla: `thresholds on metrics 'http_req_duration{nombre:consultar_cola}' have been crossed` | El servidor está saturado (poca memoria o CPU, otra carga en la misma máquina) o un cambio empeoró el rendimiento | Compare con la ejecución anterior en Actions. Si solo cambió la carga del servidor: `docker stats --no-stream` y libere recursos o agrande la VM. Si el cambio del PR es la causa, corríjalo; no suba el umbral |
| 11 | En el celular con Expo Go la app dice que no conecta | La app de desarrollo busca la API en otra dirección | En la pantalla de inicio de sesión toque **Servidor: …** y escriba la URL pública (`https://<url-de-produccion>`) |

## 9. Recomendaciones para producción

Qué debe cambiar respecto al entorno del proyecto:

1. **Credenciales de ejemplo.** Haga siempre §5.7: el entorno del proyecto deja las cuentas de demostración (`admin` / `admin123`…) a propósito, para que los evaluadores puedan probar la app. Use un `JWT_SECRET` distinto por entorno y no reutilice el de `.env.example`.
2. **HTTPS con dominio propio** (opción a de §5.5) en un servidor de la universidad o de un proveedor de nube, en lugar de una VM doméstica con Tailscale Funnel. Bloquee 8080 y 8081 desde Internet en el firewall del proveedor.
3. **Copias de seguridad programadas** (§7.3) y guardadas **fuera del servidor**. Pruebe una restauración al menos una vez por semestre.
4. **Tamaño de los recursos:** 2 vCPU y 4 GiB alcanzan para el volumen esperado. Si se aplica una prueba de carga pesada, sepárela de producción: pruebas en otra VM con su propio runner (etiqueta distinta) y `runs-on` actualizado en `cd.yml`.
5. **Aprobación antes de producción:** en Settings → Environments → `produccion`, agregue *Required reviewers*. El pipeline esperará la aprobación antes de **Desplegar en producción**.
6. **Monitoreo:** active la observabilidad (secreto `GRAFANA_ADMIN_PASSWORD`) y conecte las alertas de `observabilidad/prometheus/alertas.yml` a un canal (correo o chat) con Alertmanager.
7. **Riesgos aceptados de [seguridad.md](seguridad.md) que siguen abiertos** y lo que haría falta:

   | Riesgo | Qué hacer |
   |---|---|
   | H-01: `decode-uri-component` (alta) en la app web | Migrar la app a Expo SDK 58 y quitar la excepción de `.trivyignore` |
   | H-09a / H-09b: sin Content-Security-Policy ni aislamiento COOP/CORP | Agregar las cabeceras en `app/docker/nginx.conf` y probar con Playwright (`e2e/`) |
   | R-01 / R-02: sin límite de intentos de inicio de sesión ni de peticiones | Limitador por IP y usuario en nginx (`limit_req`) o en el backend |
   | R-04: la asignación manual no guarda qué coordinador la hizo | Registrar el usuario en `AsignarManualmente` |
   | R-05: CORS abierto | Limitar el origen a la URL pública |
   | H-10 a H-12: dependencias de desarrollo con severidad media o baja | Aprobar los PR semanales de Dependabot |

8. **Una sola instancia del backend:** SQLite es un archivo local, así que el backend no se puede replicar. Si el uso crece más allá de ≈140 solicitudes por segundo o se exige alta disponibilidad, hace falta PostgreSQL y un adaptador compartido para Socket.IO ([evolucion.md §4](evolucion.md#4-límites-conocidos-del-sistema-final)).
