# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionado semántico](https://semver.org/lang/es/). Cada versión tiene su tag `vX.Y.Z`, sus imágenes en GHCR con esa etiqueta y su [Release en GitHub](https://github.com/ItsN3M3515/soporte-tecnico-corte3/releases), que el pipeline crea con las notas de los pull requests.

## [1.1.0]

Documentación del Corte 3 y lo que la guía de implementación necesitaba para poder seguirse.

### Agregado
- Consola de usuarios (`backend/src/adapters/in/cli/usuarios.js`) y caso de uso `GestionarUsuarios`: crear el primer coordinador, cambiar claves (mínimo 10 caracteres) y retirar las cuentas de demostración, sin editar el código. Pruebas unitarias y de integración contra SQLite real.
- `scripts/respaldo.sh` y `scripts/restaurar.sh`: copia de seguridad en caliente (`VACUUM INTO`) y restauración con copia previa.
- Documentación: `docs/seguridad.md` (STRIDE, controles, hallazgos H-01 a H-13, riesgos R-01 a R-05, PR bloqueado), `docs/devops.md`, vista de despliegue en `docs/arquitectura.md` §8, ADR-008 (despliegue), ADR-009 (seguridad del pipeline), `docs/evolucion.md`, `docs/implementacion.md`, este archivo y el README del Corte 3 con la tabla de trazabilidad ampliada.

### Cambiado
- La prueba de humo acepta su propia cuenta y equipo (`HUMO_USUARIO`, `HUMO_CLAVE`, `HUMO_QR`): producción puede retirar las cuentas de demostración sin que cada despliegue falle y se revierta. Sin esas variables se comporta igual que antes.
- La prueba de humo de solo lectura cuenta bien las solicitudes (antes contaba las dos listas de la respuesta).
- Parches de Expo SDK 57 con `npx expo install --fix` y verificación de compatibilidad en CI (PR [#23](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/23)).
- La prueba de carga del SLO corre en el runner del servidor (PR [#26](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/26), ADR-008).
- Reintentos de conexión en la prueba de humo (PR [#27](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/27)).
- La imagen del backend define `NODE_OPTIONS=--disable-warning=ExperimentalWarning` para que los comandos de consola no muestren el aviso de SQLite.

## [1.0.0] — 2026-11-06

Primera versión del Corte 3: el sistema del Corte 2 en contenedores, con integración y despliegue continuos.

### Agregado
- Contenedores: `docker-compose.yml` con backend y web (nginx sin root que sirve la app Expo y pasa `/api` y `/socket.io`), healthchecks y `depends_on: service_healthy`; `.env.example` en la raíz (PR [#1](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/1)).
- CI (`ci.yml`): construcción, pruebas unitarias con umbral de cobertura, integración, 7 reglas de arquitectura (dependency-cruiser), SAST (CodeQL + umbral del SARIF), SCA (Trivy + dependency-review), secretos (Gitleaks con historial) e imágenes (Trivy + SBOM). Ruleset `proteger-main` (PR [#1](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/1)).
- CD (`cd.yml`): imágenes en GHCR con `sha-…` y `vX.Y.Z`, despliegue en pruebas y producción con un runner autohospedado, prueba de humo, prueba de carga del SLO, ZAP, reversión automática y manual (`rollback.yml`), prueba de carga larga (`slo-larga.yml`), observabilidad con Prometheus y Grafana (PR [#2](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/2)).
- Kubernetes: manifiestos con probes, límites, RBAC mínimo y NetworkPolicy, desplegados en kind desde `k8s.yml` (PR [#3](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/3)).
- Dependabot agrupado por área (PR [#20](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/20)).

### Seguridad
- `JWT_SECRET` obligatorio: se eliminó el valor de desarrollo por defecto.
- Dependencias e imágenes corregidas: body-parser, node-forge, shell-quote, source-map-js, paquetes de Debian y Alpine; cabeceras HSTS y sin `X-Powered-By` (H-04 a H-08 de `docs/seguridad.md`).

## Corte 2 (sin tag) — 2026-09-26

Backend Node.js hexagonal, app Expo con las pantallas del prototipo de Figma, 278 pruebas de Jest, 7 de Playwright y 3 escenarios de k6. Repositorio del Corte 2: <https://github.com/amyjeanine/soporte-tecnico-corte2>.
