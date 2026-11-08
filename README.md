# AsisTec · Soporte técnico en aulas — Corte 3

[![CD](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/cd.yml/badge.svg?branch=main)](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/cd.yml?query=branch%3Amain)
[![CI](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/ci.yml/badge.svg)](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/ci.yml)
[![Kubernetes](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/k8s.yml/badge.svg)](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/k8s.yml)

**Entrega continua y segura del sistema** (Corte 3) · antes: *Del reto a la arquitectura* (Corte 2)
Diseño y Arquitectura de Software (DYAS) · Universidad de La Sabana

| Integrante |
|---|
| María José Almanza Caviedes |
| Pablo Andrés Tamayo González |
| Amy Jeanine Nossa Ramírez |
| Simón Martínez García |

**Sistema desplegado:** <https://asistec.tail15cf34.ts.net> (producción) · <https://asistec.tail15cf34.ts.net:8443> (pruebas). Usuarios de demostración en la [tabla de abajo](#usuarios-de-demostración) (por ejemplo `docente` / `docente123`). El servidor es propio: si no responde, la evidencia del despliegue son las [ejecuciones del CD](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/cd.yml) ([ADR-008](docs/adr/ADR-008-estrategia-de-despliegue.md)).

Presentación del Corte 2: https://canva.link/asistec-corte-2

---

## Corte 3 en un minuto

Cada cambio entra por un pull request y pasa por un pipeline de GitHub Actions que lo construye, corre las pruebas del Corte 2, verifica las reglas de la arquitectura hexagonal y cuatro controles de seguridad. Si todo pasa y otro integrante lo aprueba, se fusiona, se publica en GHCR y se despliega solo: primero en **pruebas** (prueba de humo, carga con el SLO y ZAP) y después en **producción** (prueba de humo y reversión automática si falla).

```
rama → PR ─► CI: Construcción · Unitarias + cobertura · Integración · Arquitectura · SAST · SCA · Secretos · Imagen
          └► ruleset: 8 checks en verde + aprobación de otro integrante ─► merge a main
main ─► CD: CI ─► GHCR (sha-xxxxxxx / vX.Y.Z) ─► pruebas: humo → SLO k6 + ZAP ─► producción: humo ─(falla)─► reversión
```

| Documento | Qué tiene |
|---|---|
| [docs/devops.md](docs/devops.md) | Diagrama del pipeline, qué hace cada etapa, qué umbral la detiene y por qué, reversión (con las ejecuciones reales) |
| [docs/seguridad.md](docs/seguridad.md) | Modelo de amenazas STRIDE, controles y umbrales, registro de hallazgos y el [PR bloqueado #22](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/22) |
| [docs/arquitectura.md §8](docs/arquitectura.md#8-vista-de-despliegue-corte-3) | Vista de despliegue (C4): dónde corre cada contenedor |
| [ADR-008](docs/adr/ADR-008-estrategia-de-despliegue.md) · [ADR-009](docs/adr/ADR-009-seguridad-del-pipeline.md) | Estrategia de despliegue · seguridad del pipeline (herramientas y umbrales) |
| [docs/evolucion.md](docs/evolucion.md) | Los tres cortes, pendientes del Corte 2 y cómo se resolvieron, límites del sistema final |
| [docs/implementacion.md](docs/implementacion.md) | Guía para que la organización instale y opere el sistema por su cuenta |
| [CHANGELOG.md](CHANGELOG.md) · [Releases](https://github.com/ItsN3M3515/soporte-tecnico-corte3/releases) | Versiones |

### Levantar el sistema con Docker (desde cero)

Solo necesita Docker con Compose v2. En la raíz del repositorio:

```bash
cp .env.example .env
# cambie JWT_SECRET por un valor aleatorio, por ejemplo con:
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
docker compose up -d --build
```

Abra <http://localhost:8080>: la app web y la API (por el mismo puerto). `docker compose ps` muestra `backend` y `web` como `healthy`: `web` arranca solo cuando el healthcheck del backend (`GET /api/salud`) responde. Con observabilidad (Prometheus + Grafana en <http://localhost:3002>): `docker compose --profile observabilidad up -d`. Para apagar: `docker compose down` (agregue `--volumes` para borrar la base). En Windows, el `sed` funciona en Git Bash; si no, edite `JWT_SECRET` en `.env` a mano.

### Cómo se ejecuta el pipeline

| Workflow | Cuándo corre | Qué hace |
|---|---|---|
| [`ci.yml`](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/ci.yml) | Cada push a una rama y cada PR hacia `main` | 8 jobs = 8 checks del PR (≈ 4 min) |
| [`cd.yml`](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/cd.yml) | Cada merge a `main` y cada tag `vX.Y.Z` | CI + publicar + desplegar y verificar pruebas y producción (≈ 7 min); con tag, además crea la Release |
| [`rollback.yml`](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/rollback.yml) | A mano | Vuelve a desplegar una versión anterior y corre la prueba de humo |
| [`slo-larga.yml`](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/slo-larga.yml) | A mano | Prueba de carga larga (escenario `pico` del Corte 2) con los umbrales del SLO |
| [`k8s.yml`](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/k8s.yml) | Cambios en `k8s/`, Dockerfile o nginx | Despliegue en kind, prueba de humo y NetworkPolicy (bonificación) |

`main` está protegida (ruleset `proteger-main`, sin excepciones): pull request, aprobación de otro integrante, los 8 checks en verde y CodeQL sin alertas altas. Detalle en [docs/devops.md](docs/devops.md).

**Bonificaciones:** Kubernetes (`k8s/`, desplegado en kind desde `k8s.yml`), observabilidad (`observabilidad/`: métricas `prom-client`, Prometheus y tablero de Grafana con p95, errores y throughput del SLO) y DAST (ZAP baseline en `cd.yml` contra pruebas, hallazgos en [seguridad.md](docs/seguridad.md)).

---

## El problema (en una línea)

Cada salón tiene un teléfono para pedir soporte, pero muchas llamadas no se contestan, nadie sabe si alguien va en camino y los edificios sin "carrito" quedan sin cobertura. Nuestro sistema reemplaza la llamada por **un QR en cada equipo**: el docente lo escanea, la solicitud se asigna al técnico más cercano de su sede, y todos ven el avance **en tiempo real**.

## Arquitectura que usamos

**Hexagonal (puertos y adaptadores)** en el backend (Node.js), con la **app Expo como cliente** (cliente-servidor sobre HTTP + WebSocket). La app es nuestro prototipo de Figma **AsisTec** hecho funcionar: las 18 pantallas del prototipo están conectadas a casos de uso reales.

```
   App AsisTec (Expo, diseño de Figma)                 Programador (cada 30 s)
   docente · técnico · coordinador                     agenda + escalación
                 │ HTTP + JWT        ▲ WebSocket                  │
   ┌─────────────▼───────────────────┴─────────────────────────────▼──────────┐
   │ ADAPTADORES DE ENTRADA   Express · Socket.IO · ProgramadorEscalacion     │
   │   ┌──────────────────────────────────────────────────────────────────┐   │
   │   │ APLICACIÓN   CrearSolicitud · AtenderSolicitud · Consultas ·     │   │
   │   │   AsignarManualmente · ActivarProgramadas · EscalarVencidas ·    │   │
   │   │   Autenticar · NotificacionesDocente (Decorator del publicador)  │   │
   │   │   ┌──────────────────────────────────────────────────────────┐   │   │
   │   │   │ DOMINIO  CodigoQR · Solicitud · Tecnico (State) ·        │   │   │
   │   │   │ ColaPrioridad (Strategy) · Búsqueda (Decorator) ·        │   │   │
   │   │   │ Escalación (Chain) · FabricaSolicitudes (Factory Method) │   │   │
   │   │   └──────────────────────────────────────────────────────────┘   │   │
   │   └──────────────── PUERTOS (contratos) ─────────────────────────────┘   │
   │ ADAPTADORES DE SALIDA   SQLite · Publicador Socket.IO · JWT · Reloj      │
   └──────────────────────────────────────────────────────────────────────────┘
```

**Por qué hexagonal:** comparamos capas, hexagonal, microservicios y event-driven con criterios sacados de los retos (matriz en el [ADR-001](docs/adr/ADR-001-estilo-hexagonal.md)). Hexagonal ganó porque deja probar las reglas sin base de datos ni red, permite varias entradas (app, QR, temporizador) sobre las mismas reglas, y deja cambiar el canal de tiempo real o la base de datos sin tocar el dominio. Microservicios se descartó por desproporcionado para 2 sedes y 4 técnicos. **Qué sacrificamos:** más archivos e indirección, y un solo proceso (el límite se midió en la prueba de estrés). La regla de dependencia (el dominio no importa nada de afuera) **la verifica una prueba automática y el escaneo de código**.

Lo comprobamos al conectar el prototipo: los cinco servicios de la pantalla "Servicios" entraron como cinco creadores de la `FabricaSolicitudes`, y las notificaciones como un decorador del puerto de eventos. Los casos de uso del Corte 2 y los patrones del Corte 1 casi no cambiaron.

Documento completo con los diagramas C4 y la tabla pantalla del prototipo → caso de uso: [docs/arquitectura.md](docs/arquitectura.md).

## Pruebas que implementamos

> Cifras del Corte 2. En el Corte 3 corren en cada cambio (227 unitarias y 79 de integración, con la consola de usuarios) y la cobertura del núcleo es 99,3 % de líneas: ver la ejecución más reciente del [CI](https://github.com/ItsN3M3515/soporte-tecnico-corte3/actions/workflows/ci.yml).

| Tipo | Cantidad | Qué demuestran | Herramienta | Comando (en `backend/`) | Resultado |
|---|---|---|---|---|---|
| **Unitarias** | 208 | Reglas de negocio aisladas, sin BD ni red: formato del QR, reglas de cada servicio (préstamo, agenda, mantenimiento, evento, falla eléctrica), estados del técnico, prioridad con envejecimiento, búsqueda por sede, escalación por tiempo, avisos del docente, quién puede ver cada solicitud. Patrón AAA, clases de equivalencia, valores límite y dobles de prueba | Jest | `npm run test:unit` | ✅ 208/208 · cobertura del núcleo **98,5 %** líneas |
| **Integración** | 69 | Las fronteras del hexágono con infraestructura real: **imagen del QR → lector → API**, API → casos de uso → SQLite, eventos Socket.IO entre servidor y clientes reales, y los flujos de cada pantalla del prototipo | Jest + Supertest + jsQR + socket.io-client | `npm run test:integration` | ✅ 69/69 |
| **Sistema (caja negra)** | 1 | Una mañana completa, solo por HTTP: escanear → asignar → cola → atender → siguiente más urgente → panel admin | Jest + Supertest | incluida en integración | ✅ |
| **De punta a punta en la app (navegador)** | 7 | La app web real en Chromium: **cambiar de usuario** entre las 4 cuentas (docente, estudiante, técnico, coordinador) y comprobar a qué pantalla llega cada una y qué le prohíbe la API; **la cámara del navegador lee un QR** (cámara falsa que muestra el QR impreso) y se elige qué le pasa al equipo, una **estudiante** sube la foto de un QR y reserva, un QR de otro sistema se rechaza, y el técnico ve aparecer la solicitud sin recargar mientras la docente ve "Técnico en camino". Usa Page Object Model | Playwright | `cd e2e && npm test` | ✅ 7/7 (≈13 s) · capturas adjuntas en `e2e/reporte/` |
| **Carga** | 3 escenarios | Baseline, pico de inicio de clases y estrés, con SLO definido antes (p95 ≤ 500 ms al crear) | k6 | `bash perf/correr.sh pico` (desde la raíz) · en Windows: `k6 run perf/scripts/pico.js` con el backend prendido | ✅ baseline y pico cumplen (p95 ≤ 22 ms; en el portátil del equipo ≤ 156 ms; cifras sacadas de `perf/resultados/`) · estrés: quiebre a ≈140 sol/s |
| **Escaneo de código** | 57 archivos | Análisis estático, reglas de seguridad (ReDoS, inyección por prototipo), calidad de las pruebas, regla hexagonal y vulnerabilidades en dependencias | ESLint + eslint-plugin-security + eslint-plugin-jest + npm audit | `npm run escaneo` | ✅ 0 hallazgos (29 en el primer escaneo, 2 eran defectos reales y se corrigieron con prueba) |

**Dónde ver cada prueba:**

- **`npm run retos`** (en `backend/`): corre todo y muestra en la terminal una lista de chequeo con los 5 retos y cada prueba que los demuestra con ✓. Es lo más rápido para mostrar en la sustentación.
- **[Evidencia por reto](docs/evidencias/evidencia-por-reto.md)**: para cada reto (QR, tiempo real, multisede, pantallas del prototipo…), el código de la prueba que lo demuestra y su resultado, incluidas las pruebas en el navegador. Se regenera con `npm run evidencia`.
- [Reporte HTML de las 278 pruebas](docs/evidencias/reporte-pruebas.html): ábranlo en el navegador; se regenera con `npm run test:reporte`.
- [Escaneo de código](docs/evidencias/escaneo-codigo.md): hallazgos antes y después, qué se corrigió y por qué.
- [Estrategia y análisis de carga](docs/pruebas.md).

### Ejecución en un computador del equipo (Windows, 26/09/2026)

Además de correrlas mientras las desarrollábamos, corrimos todo desde cero en un portátil con Windows, siguiendo las instrucciones de este README. Estas son las capturas de la terminal:

| Qué | Comando | Resultado | Captura |
|---|---|---|---|
| Lista de chequeo por reto (unitarias + integración + sistema) | `cd backend` → `npm run retos` | ✅ 278 de 278 pasan, "Todos los retos quedan demostrados" | [01](docs/evidencias/windows/01-retos-278-de-278.png) |
| Pruebas de punta a punta en el navegador | `cd e2e` → `npm test` | ✅ 7 passed | [02](docs/evidencias/windows/02-navegador-7-passed.png) · [reporte](docs/evidencias/windows/03-reporte-playwright.png) |
| Carga: baseline | `k6 run perf/scripts/baseline.js` | ✅ p95 crear 156 ms · p95 cola 25 ms · 0 % errores (790 peticiones) | [04](docs/evidencias/windows/04-k6-baseline.png) |
| Carga: pico de inicio de clases | `k6 run perf/scripts/pico.js` | ✅ p95 crear 58 ms · p95 cola 50 ms · 0 % errores (4.616 peticiones, 50 req/s) | [05](docs/evidencias/windows/05-k6-pico.png) |
| Escaneo de código | `cd backend` → `npm run escaneo` | ✅ ESLint sin hallazgos, reporte generado | [06](docs/evidencias/windows/06-escaneo-codigo.png) |
| Prueba manual con Expo Go | celular escanea el QR del PC de Ad Portas | ✅ el técnico (Miguel) recibe "Sin internet" con la descripción escrita | [07](docs/evidencias/windows/07-tecnico-recibe-el-problema.png) |

Los tiempos de carga en el portátil son más altos que en la medición de `perf/resultados/` (p95 al crear: 7,5 ms en baseline y 21,8 ms en pico) porque ahí corrían a la vez el servidor, k6, VS Code y Expo, y la base ya tenía datos. Aun así cumplen el SLO (≤ 500 ms crear, ≤ 300 ms cola, < 1 % errores) con mucho margen.

| Lista de chequeo (`npm run retos`) | Navegador: 7 passed | Reporte de Playwright |
|---|---|---|
| ![](docs/evidencias/windows/01-retos-278-de-278.png) | ![](docs/evidencias/windows/02-navegador-7-passed.png) | ![](docs/evidencias/windows/03-reporte-playwright.png) |

| k6 baseline | k6 pico | Escaneo de código |
|---|---|---|
| ![](docs/evidencias/windows/04-k6-baseline.png) | ![](docs/evidencias/windows/05-k6-pico.png) | ![](docs/evidencias/windows/06-escaneo-codigo.png) |

### Ejemplo: la prueba del reto "escanear el QR"

No escribimos el texto del QR a mano. La prueba toma la **imagen PNG que se imprime y se pega en el equipo**, la **lee con un decodificador de QR** (lo mismo que hace la cámara) y envía lo leído a la API ([`escaneoQR.int.test.js`](backend/tests/integration/escaneoQR.int.test.js)):

```js
test('escanear el QR impreso del video beam del salón 101 (Edificio K) crea la solicitud y la asigna a Laura', async () => {
  // Arrange: la imagen que está pegada en el equipo
  const png = impreso('CAM-K-101-VB01');

  // Act: la "cámara" lee el QR, la app muestra qué le puede pasar a ESE equipo, la docente elige y envía
  const leido = escanear(png);
  const equipo = (await e.como('docente').get(`/api/qr/resolver?qr=${encodeURIComponent(leido)}`)).body;
  const res = await e.como('docente').post('/api/solicitudes', {
    qr: leido,
    tipo: 'FALLA_EQUIPO_FIJO',
    claseEnCurso: true,
    datos: { problema: 'SIN_IMAGEN', descripcion: 'Enciende pero la pantalla queda en azul' },
  });

  // Assert
  expect(leido).toBe('SOPORTE:v1:CAM-K-101-VB01');
  expect(equipo.problemas.map((p) => p.texto)).toContain('No proyecta imagen');
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ codigoEquipo: 'CAM-K-101-VB01', salon: '101', edificio: 'Edificio K', sede: 'CAMPUS', estado: 'ASIGNADA', tecnicoNombre: 'Laura Martínez' });
  expect(res.body.detalle).toBe('No proyecta imagen: Enciende pero la pantalla queda en azul'); // lo que lee el técnico
});
```

Después de escanear, la app pregunta **qué le pasa al equipo**. Las opciones las manda el backend según el tipo de equipo: un video beam "no proyecta imagen" o "no detecta el computador (HDMI)"; un PC "sin internet" o "muy lento". También se puede elegir "Otro problema" y describirlo. Así el técnico llega sabiendo qué revisar. El mismo archivo prueba que las opciones cambian según el equipo, que un problema que no es de ese equipo o un "Otro" sin describir se rechazan, que **los 61 QR impresos se leen y cada uno apunta a su equipo**, que un QR de otro sistema o de un equipo inexistente se rechaza, y qué pasa con un **sticker rayado**: con el 10 % del centro tapado, un QR impreso con corrección de errores H se sigue leyendo y uno con M no (por eso imprimimos en H). Medido sobre los 61 QR, con ese rayón se leen 59; para los que no, la pantalla de escaneo tiene "Buscar manualmente por edificio y salón", y también tiene su prueba.

Y en la app: la prueba de Playwright [`e2e/pruebas/qr.spec.js`](e2e/pruebas/qr.spec.js) abre la pantalla "Escanear equipo" en Chromium con una cámara falsa que transmite el QR impreso del video beam del Salón 301. La app lo lee con la cámara (jsQR), el backend responde "Salón 301 · Edificio O" y la docente termina el reporte hasta ver "Técnico asignado".

![QR leído por la cámara del navegador](docs/capturas/e2e-01-qr-leido-camara-navegador.png)

## Qué hay en este repositorio

```
README.md                  ← este archivo: badge, URL, cómo ejecutar, pipeline y tabla de trazabilidad
CHANGELOG.md               ← versiones (también en GitHub Releases)
docker-compose.yml         ← sistema completo: backend + web (+ perfil observabilidad)
.env.example               ← todas las variables, sin valores reales
deploy/                    ← docker-compose.prod.yml: imágenes de GHCR en el servidor
.github/workflows/         ← ci.yml · cd.yml · rollback.yml · slo-larga.yml · k8s.yml
.github/dependabot.yml     ← actualizaciones semanales agrupadas
scripts/                   ← deploy, reversión, prueba de humo, SLO, controles de seguridad, copias de seguridad
docs/
  arquitectura.md          ← documento de arquitectura (estilos, C4, límites) + vista de despliegue (§8)
  adr/                     ← 001 estilo · 002 concurrencia · 003 tiempo real · 004 cola · 005 avisos · 006 agenda · 007 migración · 008 despliegue · 009 seguridad del pipeline
  devops.md                ← pipeline, etapas, umbrales y reversión
  seguridad.md             ← modelo de amenazas, controles y hallazgos
  evolucion.md             ← los tres cortes del proyecto
  implementacion.md        ← guía de implementación para el negocio
  pruebas.md               ← estrategia y resultados de las pruebas (Corte 2)
  evidencias/ capturas/ qr/
backend/                   ← API Node.js en arquitectura hexagonal (Dockerfile multi-etapa)
  src/domain/ application/ ports/ adapters/ config/
  tests/unit/ tests/integration/
app/                       ← app Expo AsisTec (Dockerfile: exportación web + nginx)
e2e/                       ← pruebas de punta a punta en el navegador (Playwright)
perf/                      ← scripts k6 (slo.js con los umbrales del SLO), resultados y análisis de carga
k8s/                       ← manifiestos de Kubernetes (bonificación)
observabilidad/            ← Prometheus y Grafana (bonificación)
corte1-java/               ← código del Corte 1, como referencia
```

## Cómo ejecutar sin Docker (desarrollo, Corte 2)

Con Docker basta la sección [Levantar el sistema con Docker](#levantar-el-sistema-con-docker-desde-cero). Sin Docker, requisitos: **Node.js 22.13 o superior** (probado con 22 y 24; el backend usa el SQLite que ya trae Node, así que no hay que compilar nada). Para la app en el celular, la app **Expo Go** (compatible con SDK 57). Para carga, **k6**.

### 1. Backend

```bash
cd backend
npm install
npm start            # API en http://localhost:3000/api  (crea data/soporte.db con datos de demostración)
```

Variables (ver `backend/.env.example`; **`JWT_SECRET` es obligatoria** desde el Corte 3: `export JWT_SECRET=$(openssl rand -hex 32)` antes de `npm start`): `PORT`, `DB_PATH`, `MINUTOS_SIN_RESPUESTA` (5), `MINUTOS_EN_COLA` (10), `INTERVALO_ESCALACION_MS` (30000).

Si ya tenían una base de datos de la versión anterior (`backend/data/soporte.db`), el backend la detecta por la versión del esquema, la vuelve a crear y recarga los datos de demostración.

### 2. App (Expo)

```bash
cd app
npm install
npx expo start       # tecla "w" abre la versión web; o escanear el QR de la terminal con Expo Go
```

- **En el navegador** funciona directo contra `localhost:3000`.
- **En el celular** (misma red Wi-Fi que el computador): la app detecta sola la IP del computador que corre Expo. Si no conecta, en la pantalla de inicio de sesión toque **"Servidor: …"** y escriba `http://<IP-del-computador>:3000`. En Windows, puede que haya que permitir Node.js en el firewall.
- **Leer un QR** (pantalla "Escanear equipo"), de cualquiera de estas formas:
  1. **Celular con Expo Go:** abrir `docs/qr/imprimir.html` en el computador (o imprimirlo) y apuntar la cámara del celular a un QR.
  2. **Navegador del computador con cámara:** el navegador pide permiso a la cámara; se muestra el QR impreso (o en la pantalla del celular) frente a la cámara.
  3. **Sin cámara:** botón **"Subir foto del QR"** y elegir un PNG de `docs/qr/`.
  4. **QR dañado:** "Buscar manualmente por edificio y salón".

### Usuarios de demostración

| Rol | Usuario | Clave | Pantalla |
|---|---|---|---|
| Docente (sede CAMPUS) — "Amy Jeanine" | `docente` | `docente123` | Inicio, servicios, escanear, préstamo, seguimiento, notificaciones |
| Docente (sede NORTE) | `docente.norte` | `docente123` | ídem |
| Estudiante (sede CAMPUS) — "Valentina Rojas" | `estudiante` | `estudiante123` | Las mismas que el docente: los estudiantes también reservan y reportan |
| Técnico | `laura`, `miguel`, `sofia` (CAMPUS) · `andres` (NORTE) | `tecnico123` | 5 - Vista del técnico |
| Coordinador | `admin` | `admin123` | 6 - Panel del coordinador |

Estas cuentas existen a propósito en el entorno del proyecto, para que se pueda probar la app. En una instalación real se reemplazan con la consola de usuarios ([implementacion.md §5.7](docs/implementacion.md#57-primer-despliegue-primer-coordinador-y-cuentas-de-demostración); riesgo R-03 de [seguridad.md](docs/seguridad.md)).

En la pantalla de inicio de sesión hay cuatro botones de "Cuentas de prueba" que entran directo. **Para probar los permisos, cambien de usuario:** docente y estudiante cierran sesión en *Perfil → Cerrar sesión*; técnico y coordinador, con la flecha de arriba a la izquierda. Cada cuenta llega a su propia pantalla, y lo que no le toca el backend lo rechaza con 403 aunque se llame directo a la API.

**Demo sugerida (3 pestañas del navegador o dispositivos):** entrar como `laura` (Técnico), `admin` (Coordinador) y `docente`. La docente reporta la falla del video beam del Salón 301 del Edificio O (búsqueda manual o QR `CAM-O-301-VB01`); Laura la ve aparecer sin recargar, la acepta, y el seguimiento de la docente pasa a "Técnico en camino" y le llega la notificación.

### 3. Pruebas

```bash
cd backend
npm test                    # 278 pruebas (unitarias + integración + sistema)
npm run retos               # lista de chequeo: cada reto con las pruebas que lo demuestran
npm run test:unit           # solo unitarias (~1 s)
npm run test:integration    # solo integración y sistema
npm run test:coverage       # con cobertura; falla si baja del umbral
npm run test:reporte        # genera docs/evidencias/reporte-pruebas.html
npm run evidencia           # regenera docs/evidencias/resultados-pruebas.md y evidencia-por-reto.md
npm run escaneo             # escaneo de código (ESLint + seguridad + npm audit)
npm run medir:cola          # mide la consulta de la cola con 4.000 solicitudes → perf/resultados/micro-cola.txt
```

```bash
# carga (desde la raíz; requiere k6)
bash perf/correr.sh baseline
bash perf/correr.sh pico
bash perf/correr.sh estres
```

```bash
# de punta a punta en el navegador (Playwright). La primera vez: npm install y npm run preparar
cd e2e
npm install
npm run preparar            # compila la app web y descarga Chromium
npm test                    # levanta backend y app solos, corre las 7 pruebas
npm run reporte             # abre el reporte HTML con las capturas de cada paso
```

### 4. Códigos QR

```bash
cd backend && npm run qr    # regenera docs/qr/*.png y docs/qr/imprimir.html (hoja para imprimir)
```

---

## Tabla de trazabilidad de retos

Cada fila se puede seguir de punta a punta: reto → atributo de calidad → decisión → dónde está en el repo → prueba → resultado. **Corte 3:** dos columnas nuevas dicen qué etapa del pipeline vuelve a verificar el reto en cada cambio y qué umbral lo detiene (etapas en [docs/devops.md §2](docs/devops.md#2-etapas-umbrales-y-por-qué)). Al final hay dos filas nuevas del Corte 3.

| Reto (Corte 1) | Atributo de calidad | Decisión arquitectónica | Dónde está (repo) | Prueba que lo evidencia | Resultado | Etapa del pipeline | Umbral que detiene el pipeline |
|---|---|---|---|---|---|---|---|
| **Reservar mediante QR** | Usabilidad · Disponibilidad | Adaptador de entrada: pantalla "3a - Escanear QR" (`expo-camera` en el celular; cámara del navegador + jsQR o foto subida en la web) sobre el caso de uso `CrearSolicitud`. **Factory Method** `FabricaSolicitudes` con reglas propias por servicio. Después de escanear se elige **qué le pasa** al equipo (opciones según el tipo de equipo, `problemasEquipo.js`) y si hay clase en curso. Docentes y estudiantes pueden reservar. Si el QR no se lee: búsqueda manual por edificio y salón | `app/src/app/escanear.tsx` · `app/src/app/falla.tsx` · `app/src/ui/EscanerWeb.web.tsx` · `backend/src/domain/modelo/problemasEquipo.js` · `backend/src/application/CrearSolicitud.js` · `backend/src/domain/modelo/FabricaSolicitudes.js` | **Integración con imagen real** `escaneoQR.int.test.js`: se lee el PNG impreso, se elige qué le pasa y se crea la solicitud (falla y préstamo); las opciones dependen del equipo; un problema que no aplica → 400 · `prototipo.int.test.js`: ubicaciones → equipos del salón → solicitud · Unitarias `FabricaSolicitudes.test.js` y `ServiciosPrototipo.test.js` · `prototipo.int.test.js`: una **estudiante** reserva un PC por QR · Sistema `flujoSistema.e2e.test.js` · **Navegador (Playwright)** `e2e/pruebas/qr.spec.js`: la cámara lee el QR, se elige "No proyecta imagen" y se reporta; una estudiante sube la foto del QR y reserva | ✅ Solicitud creada en 1 petición, **p95 = 7,5 ms** en baseline y **21,8 ms** en el pico (SLO ≤ 500 ms; `perf/resultados/baseline-resumen.json` y `pico-resumen.json`) | pruebas → integración · despliegue → prueba de humo (pasos 5 y 6: escanear el QR, crear la solicitud, queda ASIGNADA) · despliegue → prueba de carga | Falla una prueba o un paso de la prueba de humo · **p95 de crear solicitud > 500 ms** o errores ≥ 1 % (`perf/scripts/slo.js`) |
| **QR asociado al PC** | Integridad · Seguridad | El QR lleva **solo** el código del equipo (`SOPORTE:v1:<código>`), validado por el objeto de valor `CodigoQR`. La ubicación (salón, edificio, sede) se resuelve en el servidor desde la tabla `equipos`. Se imprime con corrección de errores **H** | `backend/src/domain/modelo/CodigoQR.js` · `backend/src/config/imagenQR.js` · `backend/src/adapters/out/persistence/sqlite/baseDatos.js` | **`escaneoQR.int.test.js`: los 61 PNG impresos se leen y cada uno resuelve a su equipo; QR manipulado → 400; equipo inexistente → 404; sticker rayado 10 %: se lee con H, no con M; medido en los 61: se leen ≥ 95 %** · Unitarias `CodigoQR.test.js`: clases de equivalencia + longitudes límite 4/5/40/41 · **Navegador:** un QR de otro sistema se lee pero la app lo rechaza | ✅ 61/61 QR impresos leídos y asociados a su equipo. Con el 10 % rayado se leen 59/61 (los otros 2 → búsqueda manual) | pruebas → unitarias y cobertura · pruebas → integración | Falla una prueba (QR manipulado ≠ 400, equipo inexistente ≠ 404) · cobertura del núcleo < 85 % líneas / 75 % ramas |
| **Enfoque administrativo** | Seguridad · Mantenibilidad | Cuatro roles en JWT (DOCENTE, ESTUDIANTE, TECNICO, ADMIN) validados en el **adaptador** HTTP. Pantalla "6 - Panel del coordinador": `Consultas.resumenHoy()` (escaladas hoy, resueltas hoy, tiempo promedio, día de Bogotá), `Consultas.escaladas()` con el motivo, y el caso de uso `AsignarManualmente` | `backend/src/adapters/in/http/app.js` · `backend/src/application/Consultas.js` · `backend/src/application/AsignarManualmente.js` · `app/src/app/coordinador.tsx` | Integración `api.int.test.js` › seguridad y roles (401/403) · una estudiante no entra al panel ni acepta como técnico (403) · cada cuenta ve solo el detalle de SUS solicitudes (la docente no abre la de la estudiante: 403) · **Navegador (Playwright)** `cuentas.spec.js`: se cambia de usuario entre las 4 cuentas y cada una llega a su pantalla; directo a la API, cada cuenta recibe 403 en lo que no le toca · `prototipo.int.test.js` › pantalla 6 (escalada con motivo → asignar a mano → tarjetas del día) · Unitaria "«hoy» es el día en Bogotá" (23:50 cuenta, 00:10 del día siguiente no) | ✅ Accesos indebidos bloqueados; el coordinador resuelve una escalada desde la app | pruebas → integración · seguridad → SAST · despliegue → prueba de humo (paso 4: sin token → 401) | Falla una prueba de 401/403 · hallazgo de CodeQL con severidad ≥ 7,0 · la API responde sin token |
| **Reporte en tiempo real** | Rendimiento · Usabilidad | Eventos de dominio publicados por el puerto `PublicadorEventos` **después** de confirmar la transacción. Adaptador Socket.IO con salas `admin`, `sede:X`, `tecnico:Y` y `usuario:Z` (ADR-003). **Decorator** `NotificacionesDocente` guarda los avisos del docente (ADR-005) | `backend/src/ports/puertos.js` · `backend/src/application/NotificacionesDocente.js` · `backend/src/adapters/in/realtime/servidorSockets.js` · `app/src/lib/tiempoReal.tsx` | Integración `tiempoReal.int.test.js` (servidor y clientes reales) · `prototipo.int.test.js`: cuando Laura acepta, al socket de la docente le llegan el cambio y el aviso "Laura va en camino a Salón 101" · Unitarias del decorador (un fallo al guardar el aviso no tumba la solicitud) · **Navegador (Playwright)** `tiempo-real.spec.js`: dos pestañas; el técnico del Norte ve la solicitud sin recargar | ✅ Eventos entregados a quien corresponde; pantallas 1, 4, 5, 6 y 11 se actualizan sin recargar | pruebas → integración (Socket.IO con clientes reales) | Falla una prueba (un evento no llega a la sala correcta o llega a otra sede) |
| **Cola de prioridades** | Rendimiento · Equidad (sin inanición) | Montículo `ColaPrioridad` + **Strategy** `PoliticaImpactoYEspera` (impacto por tipo + 2 pts/min, tope 60 min). Lo agendado entra a la cola 30 min antes (`ActivarProgramadas`, ADR-006). Consulta paginada (ADR-004) | `backend/src/domain/prioridad/` · `backend/src/application/ActivarProgramadas.js` · `backend/src/domain/asignacion/GestorAsignaciones.js` | Unitarias `Prioridad.test.js` (límites de aging 0/1/59/60/61/600 min) · orden de los 5 servicios · agenda 29 ✗ / 30 ✓ min · Sistema: la urgente se atiende antes que el préstamo más antiguo · **k6 pico:** 30 sol/s, 1 min | ✅ Sin inanición. **Pico: p95 cola = 18,6 ms** (SLO ≤ 300 ms; `perf/resultados/pico-resumen.json`), 0 % errores. ⚠️ Estrés: quiebre a ≈140 sol/s (ver límites) | pruebas → unitarias · despliegue → prueba de carga | Falla una prueba de prioridad o envejecimiento · **p95 de consultar la cola > 300 ms** o errores ≥ 1 % |
| **Multisede (distribución y demanda)** | Escalabilidad · Disponibilidad | La asignación automática se restringe a la sede. **Decorator** doble: edificio → cercanos → cualquiera de la sede. El panel calcula por sede la cola, los técnicos libres y el **déficit**; si una sede se satura, el coordinador puede mandar un técnico de otra sede ("Asignar manualmente") | `backend/src/domain/busqueda/busqueda.js` · `backend/src/application/Consultas.js` · `backend/src/application/AsignarManualmente.js` | Unitaria "NUNCA asigna un técnico de otra sede" · Integración: sede NORTE saturada no toma técnicos del CAMPUS; déficit por sede · Unitaria: el coordinador manda a Andrés (NORTE) a una escalada del CAMPUS y se avisa a ambas sedes · Tiempo real: el técnico del NORTE no recibe eventos del CAMPUS | ✅ Aislamiento automático por sede y redistribución manual comprobados | pruebas → unitarias · pruebas → integración | Falla una prueba (asignación a otra sede, eventos entre sedes) |
| **Implementar pruebas** | Confiabilidad · Testabilidad | Estilo hexagonal: el núcleo no depende de infraestructura (regla verificada por prueba). Reloj inyectable. Composición única reutilizada por las pruebas de integración. Evidencia generada desde una sola ejecución (`npm run evidencia`) | `backend/tests/` · `backend/tests/unit/arquitectura.test.js` · `backend/src/config/contenedor.js` · `perf/` | `npm test` · `npm run test:coverage` · `npm run escaneo` · `bash perf/correr.sh …` | ✅ **278/278 pasan** + 7/7 en el navegador. Cobertura del núcleo solo con unitarias: **98,6 % líneas, 91,2 % ramas**. Escaneo: 0 hallazgos | pruebas → unitarias y cobertura · pruebas → integración · reglas de arquitectura | Cobertura de `src/domain` + `src/application` < 85 % líneas o < 75 % ramas (`jest.coverageThreshold`) · falla una prueba · una dependencia prohibida |
| **Pantalla del trabajador** | Usabilidad · Consistencia | Pantalla "5 - Vista del técnico" sobre `AtenderSolicitud` y el **State** del Corte 1: solo aparece el botón de la transición válida (aceptar → confirmar llegada → resolver) y "Cancelar" mientras no ha llegado. Escalación automática con **Chain of Responsibility** si no acepta en 5 min | `app/src/app/tecnico.tsx` · `backend/src/application/AtenderSolicitud.js` · `backend/src/domain/tecnicos/estados.js` · `backend/src/adapters/in/scheduler/ProgramadorEscalacion.js` | Unitarias `Tecnico.test.js` (transiciones inválidas) · "Cancelar" pasa la solicitud a otro técnico y nunca al mismo · escala a los 5 min y no a los 4 · Integración "si Laura no acepta en 5 minutos se reasigna" | ✅ Ninguna transición inválida altera el estado; reasignación automática y por cancelación comprobadas | pruebas → unitarias · pruebas → integración | Falla una prueba (transición inválida del State, reasignación a los 5 min) |
| *Prototipo de Figma AsisTec* | Usabilidad · Modificabilidad | La app reproduce las 18 pantallas del prototipo (tokens, tipografía Inter, iconos exportados de Figma). Cada servicio del prototipo es un creador más de la fábrica | `app/src/app/` · `app/src/ui/` · `docs/arquitectura.md` §4.7 | `ServiciosPrototipo.test.js` (32) · `CasosDeUsoPrototipo.test.js` (26) · `prototipo.int.test.js` (17) · recorrido con Playwright que captura cada pantalla sin errores en consola (`app/scripts/capturas.js`) | ✅ Capturas en `docs/capturas/`, una por pantalla | construcción (`tsc --noEmit`, `npx expo install --check`) · imagen (exportación web dentro de `app/Dockerfile`) · despliegue → prueba de humo (paso 2: la app web carga) | La app no compila o no se exporta · dependencias incompatibles con Expo SDK 57. **Sin verificación automática de las pantallas:** las pruebas de Playwright (`e2e/`) se corren a mano porque necesitan Chromium y la app exportada; la usabilidad requiere evaluación con usuarios (SUS, no hecha) |
| *Migración del Corte 1 a JS / Expo (ADR-007)* | Mantenibilidad del equipo | Backend Node.js y app Expo (SDK 57). El Java del Corte 1 se pasó a Node clase por clase, con los mismos nombres y patrones; alternativas, costo y trazabilidad en el **[ADR-007](docs/adr/ADR-007-migracion-java-a-node.md)** | `backend/`, `app/`, `corte1-java/` | `npx tsc --noEmit`, `npx expo export -p web` y `-p android` en `app/` sin errores | ✅ | construcción | No compila o una dependencia no se resuelve (`npm ci`) |
| *Regla de dependencia hexagonal (ADR-001), Corte 3* | Modificabilidad · Testabilidad | El dominio y los casos de uso solo hablan con el exterior por puertos; los adaptadores de entrada no tocan los de salida; solo la raíz de composición conecta adaptadores | `backend/.dependency-cruiser.cjs` (7 reglas) · `backend/tests/unit/arquitectura.test.js` | `npm run arquitectura` (dependency-cruiser) y la prueba de Jest de arquitectura | ✅ 0 violaciones (50 módulos) | reglas de arquitectura | Un archivo de `src/domain` o `src/application` importa `src/adapters`, `src/config`, Express, Socket.IO, SQLite o JWT; un adaptador de entrada importa uno de salida; un ciclo |
| *Seguridad de la entrega, Corte 3* | Seguridad | Cuatro controles como quality gates (ADR-009); STRIDE en [seguridad.md](docs/seguridad.md) | `.github/workflows/ci.yml` · `scripts/umbral-sast.sh`, `sca.sh`, `secretos.sh`, `escaneo-imagen.sh` · `.zap/reglas.tsv` | PR [#22](https://github.com/ItsN3M3515/soporte-tecnico-corte3/pull/22) bloqueado; ZAP en cada despliegue | ✅ 0 alertas abiertas de code scanning; hallazgos registrados | seguridad → SAST, SCA, secretos · imagen y escaneo · despliegue → DAST | CodeQL ≥ 7,0 sin tratar · dependencia alta o crítica con corrección · cualquier secreto en el historial · imagen con alta o crítica con corrección · regla `FAIL` de ZAP |

### Lo que no se logró resolver por completo (Corte 2)

> Cómo quedó cada punto en el Corte 3: [evolucion.md §3](docs/evolucion.md#3-pendientes-del-corte-2-y-cómo-se-resolvieron).

- **Escalabilidad más allá de ≈140 solicitudes/s:** el proceso único de Node recalcula la cola en cada consulta. Paginarla (ADR-004) subió el límite y redujo 97 % los datos transferidos, pero no quita el cuello de botella: bajo estrés sigue habiendo timeouts. Para varias instancias hace falta PostgreSQL en vez de SQLite ([pruebas.md §4.4](docs/pruebas.md#44-análisis-del-cuello-de-botella)). Al conectar el prototipo, la prueba de estrés detectó una regresión (≈97 sol/s) que corregimos ([§4.5](docs/pruebas.md#45-una-regresión-que-encontró-la-prueba-de-carga)).
- **Notificaciones con la app cerrada:** los avisos quedan guardados y llegan en vivo con la app abierta, pero no hay notificaciones push.
- **Campos del prototipo que cambiamos:** "Edificio y salón" era texto libre y en la app se elige de una lista (para no aceptar salones que no existen); la hora del calendario se elige entre bloques fijos.
- **Datos y pesos de demostración:** las sedes, edificios, técnicos, pesos de prioridad y mapa de cercanía los definió el equipo, no el área de soporte real.
- **Pruebas de UI:** se hicieron con Playwright (7 flujos clave), no con Cypress/Selenium, y no cubren todas las pantallas. **UX (SUS):** no se hizo.

Detalle en [docs/arquitectura.md §7](docs/arquitectura.md#7-límites-conocidos-del-diseño-y-trabajo-pendiente-para-el-corte-3).

---

## Capturas

Una por pantalla del prototipo, tomadas de la app funcionando contra el backend (carpeta [`docs/capturas/`](docs/capturas)).

| 1 - Inicio | 3a - Escanear QR | 4 - Seguimiento | 5 - Técnico | 6 - Coordinador |
|---|---|---|---|---|
| ![](docs/capturas/01-inicio.png) | ![](docs/capturas/03a-equipo-detectado.png) | ![](docs/capturas/04-seguimiento-tiempo-real.png) | ![](docs/capturas/05-vista-tecnico.png) | ![](docs/capturas/06-panel-coordinador.png) |

| 3c - Préstamo agendado | Calendario | 8 - Mis solicitudes | 11 - Notificaciones | 9 - Servicios |
|---|---|---|---|---|
| ![](docs/capturas/03c-prestamo-agendado.png) | ![](docs/capturas/03c-calendario.png) | ![](docs/capturas/08-mis-solicitudes.png) | ![](docs/capturas/11-notificaciones.png) | ![](docs/capturas/09-servicios.png) |

Tomadas por las pruebas de Playwright (`e2e/`):

| Inicio de sesión | QR leído por la cámara | ¿Qué le pasa? | Seguimiento tras el QR | Estudiante reserva desde QR | QR de otro sistema |
|---|---|---|---|---|---|
| ![](docs/capturas/00-inicio-sesion.png) | ![](docs/capturas/e2e-01-qr-leido-camara-navegador.png) | ![](docs/capturas/e2e-10-que-le-pasa-al-equipo.png) | ![](docs/capturas/e2e-02-seguimiento-desde-qr.png) | ![](docs/capturas/e2e-03-estudiante-prestamo-desde-qr.png) | ![](docs/capturas/e2e-04-qr-otro-sistema-rechazado.png) |

Lo que ve el técnico cuando le llega un reporte por QR (sin recargar):

![Técnico ve qué le pasa al equipo](docs/capturas/e2e-11-tecnico-ve-que-le-pasa.png)

Cambio de usuario (`e2e/pruebas/cuentas.spec.js`):

| Docente | Estudiante | Técnico | Coordinador | Dirección del panel sin permiso |
|---|---|---|---|---|
| ![](docs/capturas/e2e-05-cuenta-docente.png) | ![](docs/capturas/e2e-06-cuenta-estudiante.png) | ![](docs/capturas/e2e-07-cuenta-tecnico.png) | ![](docs/capturas/e2e-08-cuenta-coordinador.png) | ![](docs/capturas/e2e-09-direccion-panel-sin-permiso.png) |

## Documentación

- **Corte 3:** [DevOps](docs/devops.md) · [Seguridad](docs/seguridad.md) · [Vista de despliegue](docs/arquitectura.md#8-vista-de-despliegue-corte-3) · [Evolución](docs/evolucion.md) · [Guía de implementación](docs/implementacion.md) · [ADR-008 Despliegue](docs/adr/ADR-008-estrategia-de-despliegue.md) · [ADR-009 Seguridad del pipeline](docs/adr/ADR-009-seguridad-del-pipeline.md) · [CHANGELOG](CHANGELOG.md)
- [Documento de arquitectura](docs/arquitectura.md)
- [ADR-001 Estilo hexagonal](docs/adr/ADR-001-estilo-hexagonal.md) · [ADR-002 Bloqueo optimista](docs/adr/ADR-002-concurrencia-bloqueo-optimista.md) · [ADR-003 Tiempo real y cola](docs/adr/ADR-003-tiempo-real-y-cola.md) · [ADR-004 Paginación de la cola](docs/adr/ADR-004-limite-en-consulta-de-cola.md) · [ADR-005 Avisos del docente (Decorator)](docs/adr/ADR-005-notificaciones-decorator.md) · [ADR-006 Solicitudes agendadas](docs/adr/ADR-006-solicitudes-agendadas.md) · [ADR-007 Migración de Java a Node](docs/adr/ADR-007-migracion-java-a-node.md)
- [Estrategia y resultados de pruebas](docs/pruebas.md) · [Evidencia de ejecución](docs/evidencias/resultados-pruebas.md) · [Plan de carga](perf/README.md)
