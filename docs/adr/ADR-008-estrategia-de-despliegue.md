# ADR-008 — Estrategia de despliegue: VM propia con runner autohospedado, Docker Compose y Tailscale Funnel

- **Estado:** Aceptada
- **Fecha:** 2026-11-05 (ajustes del 2026-11-06 registrados abajo)
- **Decisores:** María José Almanza, Pablo Tamayo, Amy Nossa, Simón Martínez

## Contexto

El Corte 3 pide que cada cambio que llega a `main` se despliegue sin pasos manuales en un entorno accesible, que después se verifique con una prueba de humo y una prueba de carga del SLO, y que se pueda volver a la versión anterior.

Lo que condiciona la decisión en AsisTec:

| Condición | Por qué importa |
|---|---|
| La base de datos es **SQLite en un archivo** (`node:sqlite`, ADR-001) | El entorno necesita un disco que sobreviva a reinicios y despliegues. En un contenedor efímero la cola de solicitudes se borraría en cada versión |
| Un solo proceso con **Socket.IO** (tiempo real) | El entorno debe aceptar WebSocket de larga duración y no "dormir" el servicio (las pantallas del técnico y del coordinador quedan abiertas) |
| El SLO del Corte 2 (p95 crear ≤ 500 ms, cola ≤ 300 ms, errores < 1 %) se mide en cada despliegue | Un entorno que se suspende o que varía mucho de latencia deja `main` en rojo sin que el código empeore, y eso cuesta 45 puntos de la rúbrica |
| Presupuesto: cero | Somos cuatro estudiantes; nada de tarjeta de crédito |
| Un integrante tiene un servidor propio encendido (Proxmox, "Atlas") con una conexión doméstica a Internet | Permite un runner autohospedado, pero no queremos abrir puertos de la red de la casa |

## Opciones consideradas

| Opción | A favor | En contra |
|---|---|---|
| **A. Render / Railway / Fly.io (plan gratuito)** | Despliegue desde GitHub en minutos, HTTPS incluido | El plan gratuito duerme el servicio tras minutos sin uso (la primera petición tarda decenas de segundos y la prueba de carga mediría el arranque); disco efímero o volumen de pago, así que SQLite perdería los datos en cada despliegue; los WebSocket se cortan al dormir |
| **B. Azure for Students / AWS Academy** | Nube real, VM con disco persistente | Crédito que se acaba o laboratorio que se apaga solo (AWS Academy cierra la sesión cada pocas horas); cuentas por integrante, no compartidas; más configuración (red, grupos de seguridad, IP pública) que no es el objetivo del curso |
| **C. VM propia en el servidor del equipo + runner autohospedado + Docker Compose** | Gratis; disco persistente (la base es un volumen de Docker, la copia de seguridad es copiar un archivo); el mismo `docker-compose.yml` que se usa en local; es el esquema del taller del profesor (DYAS-DevSecOps) | La disponibilidad depende de la luz y el Internet de una casa; el runner ejecuta código del repositorio dentro de nuestra red; hay que publicar la URL sin abrir puertos en el router |
| **D. Kubernetes administrado (AKS/GKE/EKS)** | Escalado, probes y autorreparación | Costo, y un solo proceso con SQLite no escala horizontalmente (ADR-001, límite 1 de `evolucion.md`). Los manifiestos sí se hicieron, para kind, como bonificación |

Para publicar la VM sin abrir puertos se compararon:

| Opción | En contra / a favor |
|---|---|
| Reenvío de puertos en el router | Expondría la red de la casa a Internet, depende de que el proveedor dé una IP pública (que además cambia) y obliga a manejar el certificado HTTPS |
| Cloudflare Tunnel | Gratis y estable, pero exige un dominio propio administrado en Cloudflare |
| **Tailscale Funnel** | Gratis, HTTPS con certificado automático en `*.ts.net`, sin dominio y sin abrir puertos; el mismo Tailscale da acceso privado (Grafana, SSH) al equipo |

## Decisión

**Opción C con Tailscale Funnel.**

- Una VM pequeña (`asistec`, Debian 13, 2 vCPU, 3 GiB de RAM, 30 GB de disco) en el servidor Proxmox del equipo, en una **red aislada** que solo sale a Internet: no ve la red de la casa ni el servidor que la aloja.
- Dentro de la VM: Docker con Compose, Tailscale y un **runner autohospedado** de GitHub Actions (`asistec-atlas`, etiqueta `asistec`).
- `cd.yml` publica las imágenes en GHCR (`sha-<commit>` siempre y `vX.Y.Z` con un tag; nunca `latest`) y el runner despliega con `scripts/deploy.sh`, que usa `docker-compose.yml` + `deploy/docker-compose.prod.yml` y espera a que los healthchecks estén en verde (`docker compose up --wait`).
- **Dos entornos en la misma VM**, cada uno como un proyecto de Compose aparte (`asistec-pruebas` en el puerto 8081, `asistec-produccion` en el 8080):
  - **pruebas** recibe primero cada versión, con la base de datos nueva en cada despliegue; contra él corren la prueba de humo completa (crea una solicitud), la prueba de carga del SLO y ZAP. La carga crea cientos de solicitudes: en producción llenaría la cola real.
  - **produccion** se despliega solo si pruebas pasó todo; su prueba de humo es de solo lectura y, si falla, el job **Reversión automática** vuelve a la versión anterior.
- Funnel publica `https://asistec.tail15cf34.ts.net` (producción) y el puerto `:8443` (pruebas). Grafana (`:3443`) solo en la red privada del equipo.
- Los secretos (`JWT_SECRET`, `GRAFANA_ADMIN_PASSWORD`) están en **GitHub Environments** (`pruebas`, `produccion`), limitados a `main` y a tags `v*.*.*`. El pipeline escribe el `.env` del entorno en el servidor con permisos 0600 (`scripts/escribir-env.sh`).

### Ajuste del 2026-11-06: dónde corren las verificaciones

Al principio, la prueba de humo, la carga y ZAP corrían en runners de GitHub (en EE. UU.) contra la URL pública, "como un usuario". Con el mismo backend, el p95 de la consulta de la cola pasó de 129 ms a 234 ms entre dos ejecuciones (umbral: 300 ms): el viaje por Internet y por el túnel pesaba más que el servidor. Un rojo intermitente en `main` costaría 45 puntos sin que el sistema hubiera empeorado. Se decidió (PR [#26](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/26)):

- La **prueba de carga del SLO** corre en el runner de la VM contra la URL de pruebas. Dentro de la VM ese nombre resuelve a la propia VM, así que mide el servicio desplegado completo (TLS → nginx → backend → SQLite) sin el tramo público. Resultado desde entonces: p95 crear ≈ 11 ms, cola ≈ 9 ms.
- La **prueba de humo** y **ZAP** siguen entrando desde Internet: comprueban que la URL pública funciona.
- **Sacrificio:** el SLO medido no incluye la red pública. Es la parte que el equipo no controla.

El mismo día, un error aislado de TLS del túnel hizo fallar la prueba de humo de producción y disparó una reversión automática real ([run 42247596257](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/runs/42247596257)). Se agregaron reintentos de conexión a `scripts/smoke-test.sh` (PR [#27](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/27)); un 4xx o 5xx de la aplicación no se reintenta.

## Consecuencias

**Positivas**
- Cero costo, y lo desplegado es exactamente lo que el pipeline construyó y escaneó: la imagen se publica una vez y se despliega por su etiqueta.
- Los datos sobreviven a los despliegues (volumen `datos-soporte`); una copia de seguridad es copiar `soporte.db` ([implementacion.md §7.3](../implementacion.md#73-copia-de-seguridad-y-restauración)).
- Reversión en segundos: las imágenes anteriores ya están en GHCR y `scripts/rollback.sh` vuelve a desplegar `version-anterior` sin reconstruir. Se probó a mano y ocurrió una vez sola ([devops.md §4](../devops.md#4-reversión)).
- El mismo `docker-compose.yml` sirve para un integrante en su computador, para el profesor al calificar y para el servidor.

**Negativas (qué sacrificamos)**
- **Disponibilidad doméstica:** si se va la luz o el Internet de la casa, el sistema no responde, y los despliegues quedan en cola hasta 24 horas. El servidor se apaga solo cuando está inactivo; para la semana de presentación y calificación (15 al 23 de noviembre) un temporizador lo mantiene encendido.
- **El runner ejecuta código del repositorio en nuestra infraestructura.** Se mitiga con la red aislada de la VM, jobs con runner solo en `main`/tags/a mano, environments limitados a `main` y aprobación para PR de forks (amenaza A7 de [seguridad.md](../seguridad.md)).
- **Pruebas y producción comparten la VM:** una prueba de carga muy pesada podría afectar a producción. Con 2 solicitudes/s durante 30 s no se notó; para una carga real habría que separarlos.
- El SLO del pipeline no mide la red pública (ajuste del 2026-11-06).

**Qué cambiaría el negocio** (ver [implementacion.md §9](../implementacion.md#9-recomendaciones-para-producción)): un servidor en la nube o en el centro de datos de la universidad, con dominio propio y su certificado, en lugar de una VM doméstica con Funnel. Los pasos del pipeline no cambian: solo la etiqueta del runner y las URL.
