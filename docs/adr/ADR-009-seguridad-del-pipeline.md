# ADR-009 — Estrategia de seguridad del pipeline: herramientas y umbrales

- **Estado:** Aceptada
- **Fecha:** 2026-11-05
- **Decisores:** María José Almanza, Pablo Tamayo, Amy Nossa, Simón Martínez

## Contexto

El enunciado del Corte 3 exige cuatro controles que detengan el pipeline cuando encuentran un problema por encima de un umbral mínimo: SAST (ningún alto o crítico sin tratar), SCA (ninguna alta o crítica con corrección), secretos (cero, incluido el historial) y escaneo de la imagen (ninguna crítica con corrección). Cada grupo puede endurecer los umbrales, no relajarlos.

Lo que condiciona la elección en AsisTec:

- Código propio en **JavaScript y TypeScript** (backend Node.js, app Expo), con dependencias de npm en tres `package-lock.json` (backend, app, e2e).
- Dos imágenes: `asistec-backend` (Debian slim + Node 22) y `asistec-web` (Alpine + nginx sin root).
- El historial de Git viene del Corte 2, cuando el backend tenía un secreto de desarrollo por defecto y las pruebas de carga guardaban JWT en los resúmenes.
- Repositorio público en GitHub: CodeQL y la pestaña Security son gratis.
- Queremos que cualquier integrante pueda correr los mismos controles en su computador, con las mismas versiones, antes de abrir un PR.

## Opciones consideradas

| Control | Opciones | Elegida | Por qué |
|---|---|---|---|
| SAST | CodeQL · Semgrep · SonarCloud | **CodeQL** (`security-extended`) | Integrado con GitHub (pestaña Security, regla del ruleset), gratis en repositorios públicos y con buen soporte de JavaScript/TypeScript. SonarCloud exige una cuenta externa y un token, y su quality gate vive fuera del repositorio. Semgrep sería la alternativa si el repositorio fuera privado |
| SCA | npm audit · Trivy fs · OWASP Dependency-Check · dependency-review-action | **Trivy fs** + **dependency-review** en los PR | Trivy revisa los tres `package-lock.json` en un solo paso, permite excepciones justificadas por CVE (`.trivyignore`) y es la misma herramienta del escaneo de la imagen. `npm audit` no permite ignorar un CVE concreto con justificación (o todo o nada) y habría que correrlo por carpeta. Dependency-Check es lento y necesita una llave de la NVD. dependency-review agrega en los PR un aviso específico: "este cambio agrega una dependencia vulnerable" |
| Secretos | Gitleaks · TruffleHog · secret scanning de GitHub | **Gitleaks** (todo el historial) | Corre en local y en el pipeline con el mismo contenedor, falla con código de salida y permite excepciones por ruta con comentario (`.gitleaks.toml`). El secret scanning y la protección de push de GitHub también están activos, como capa adicional |
| Imagen | Trivy · Grype · Docker Scout | **Trivy image** + SBOM CycloneDX | Misma herramienta y mismo archivo de excepciones que el SCA; el SBOM queda como artefacto de cada versión |
| DAST (bonificación) | OWASP ZAP baseline · ZAP full scan · Nuclei | **ZAP baseline** contra pruebas | Escaneo pasivo: no ataca la aplicación, así que se puede correr en cada despliegue sin ensuciar datos ni tardar mucho (≈ 1,5 min) |

## Decisión: herramientas y umbrales

| Control | Umbral que detiene el pipeline | Frente al enunciado | Por qué ese valor |
|---|---|---|---|
| SAST | `security-severity` ≥ 7,0 sin tratar (`scripts/umbral-sast.sh` lee el SARIF), con el conjunto de consultas `security-extended` | Mismo umbral, **más consultas** | Alto y crítico son lo que permite atacar el sistema. `security-extended` agrega consultas de menor precisión; si producen un falso positivo, se registra en vez de perder la cobertura |
| SCA | Alta o crítica **con corrección disponible** | Igual | Una vulnerabilidad sin corrección no se puede arreglar actualizando; bloquear por ella detendría al equipo sin ganar seguridad. Esas se registran como riesgo aceptado (ver H-12) |
| Secretos | Cero, en todo el historial | Igual | Un secreto filtrado se puede usar aunque se borre del último commit |
| Imagen | **Alta** o crítica con corrección | **Más estricto** (el enunciado pide solo crítica) | Las correcciones de la imagen casi siempre son una actualización del sistema operativo (`apt-get upgrade`, `apk upgrade`) o quitar algo que no se usa (npm, curl). Corregir altas cuesta poco, y así lo comprobamos en H-06 y H-07 |
| DAST | Reglas `FAIL` de `.zap/reglas.tsv`: cookies sin `HttpOnly`/`Secure`, clickjacking, `X-Content-Type-Options`, HSTS, divulgación de versiones, de errores y de datos | No exigido | Son fallas que el sistema ya corrigió (H-08) y que una regresión de nginx volvería a abrir. Las `WARN` se revisan y se registran (H-09) |

Reglas que acompañan los umbrales:

1. **Toda excepción tiene su registro.** `.trivyignore`, `.gitleaks.toml`, `.github/codeql/excepciones-sast.txt` y las reglas `IGNORE` de ZAP solo aceptan entradas con su fila en `docs/seguridad.md`, con la decisión (falso positivo o riesgo aceptado), la justificación y lo que haría falta para corregirlo.
2. **Versiones fijas.** Trivy 0.76.2, Gitleaks v8.30.1, ZAP 2.17.0 y k6 2.3.0 están fijadas en `scripts/comun.sh` y en los workflows. Así un control no cambia de comportamiento solo, y lo que pasa en local es lo que pasa en el pipeline. Dependabot actualiza las imágenes base y las actions; las herramientas de `comun.sh` se actualizan a mano.
3. **Los controles son obligatorios para fusionar.** Los cuatro jobs están entre los 8 checks requeridos por el ruleset `proteger-main`, que no tiene excepciones (ni el administrador). El ruleset además exige que CodeQL no tenga alertas altas o críticas.
4. **Dependabot complementa, no reemplaza.** Abre PR semanales agrupados por área; cada uno pasa por el mismo pipeline y necesita la aprobación de un integrante.
5. **Mínimo privilegio en el pipeline.** `permissions: contents: read` por defecto; solo `publicar` puede escribir en GHCR (`packages: write`), solo `sast` puede subir resultados (`security-events: write`) y solo `release` puede crear la Release (`contents: write`).

## Consecuencias

**Positivas**
- Los cuatro controles corren en paralelo y el CI completo tarda ≈ 4 minutos (umbral del enunciado: 10). El más lento es el escaneo de imágenes, gracias a la caché de capas.
- Funcionan: el PR [#22](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/22) con lodash 4.17.15 quedó bloqueado por SCA y por el escaneo de la imagen.
- Encontraron problemas reales antes de la primera versión: `body-parser`, `shell-quote` (crítica), paquetes de Debian y Alpine (H-04 a H-07) y cabeceras de nginx (H-08).
- Los mismos scripts corren en local (`scripts/sca.sh`, `scripts/secretos.sh`, `scripts/escaneo-imagen.sh`).

**Negativas (qué sacrificamos)**
- **Tiempo del equipo en falsos positivos:** Gitleaks marcó JWT viejos y JavaScript minificado (H-02, H-03); ZAP da 10 avisos, casi todos del paquete minificado (H-09). Cada uno exige escribir una justificación.
- **Una vulnerabilidad alta queda aceptada (H-01)** porque corregirla exige migrar la app a Expo SDK 58. La aceptamos con registro y la evitamos en el pipeline con `.trivyignore`, en lugar de bajar el umbral para todos.
- **Las versiones fijas envejecen:** si nadie actualiza `scripts/comun.sh`, Trivy usa reglas viejas (su base de vulnerabilidades sí se descarga en cada ejecución).
- **Sin SonarCloud** no hay métricas de deuda técnica en el pipeline; la calidad la cubren ESLint (job Construcción) y la cobertura.
