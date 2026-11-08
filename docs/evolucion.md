# Evolución del sistema en los tres cortes

**Diseño y Arquitectura de Software (DYAS) · Corte 3**

El recorrido de AsisTec desde el diseño de clases hasta un sistema desplegado: qué decisiones se mantuvieron, cuáles cambiaron y por qué, cómo se resolvieron los pendientes del Corte 2 y cuáles son los límites del sistema final.

---

## 1. Los tres cortes en una tabla

| | Corte 1 · Diseño | Corte 2 · Arquitectura y pruebas | Corte 3 · Entrega continua y segura |
|---|---|---|---|
| **Pregunta** | ¿Cómo se asigna una solicitud al técnico correcto? | ¿Qué estilo resuelve los retos y cómo demostramos que funciona? | ¿Cómo sabemos que un cambio no rompe nada antes de que llegue a producción? |
| **Qué se entregó** | Módulo Java en memoria (`corte1-java/`, 18 clases): Singleton, State, Decorator, Chain of Responsibility | Backend Node.js hexagonal + app Expo con las 18 pantallas del prototipo de Figma; SQLite; Socket.IO; 278 pruebas de Jest, 7 de Playwright y 3 escenarios de k6 | El mismo sistema en contenedores, con un pipeline de 8 etapas, 4 controles de seguridad, despliegue automático en dos entornos, reversión, observabilidad, DAST y Kubernetes |
| **Cómo se probaba** | Escenarios de consola en `Main.java` | Comandos a mano en el computador de un integrante (`npm test`, `k6 run`) | Automático en cada push y PR; el SLO se mide contra lo desplegado después de cada despliegue |
| **Dónde corría** | En la terminal de quien lo ejecutaba | En el computador de cada integrante | En una VM del equipo, publicada en `https://asistec.tail15cf34.ts.net` |
| **Decisiones registradas** | Diagrama UML y patrones | ADR-001 a ADR-007 | ADR-008 (despliegue) y ADR-009 (seguridad del pipeline) |

## 2. Decisiones: qué se mantuvo y qué cambió

### 2.1 Se mantuvieron

| Decisión | Desde | Por qué se mantuvo en el Corte 3 |
|---|---|---|
| Estilo **hexagonal** (ADR-001) | Corte 2 | Facilitó el Corte 3: las reglas del estilo se convirtieron en funciones de aptitud del pipeline (7 reglas de dependency-cruiser), y la consola de usuarios entró como un adaptador de entrada más sin tocar el dominio |
| State, Decorator y Chain of Responsibility del Corte 1 | Corte 1 | Siguen en `backend/src/domain` con los mismos nombres; el Corte 3 no cambió reglas de negocio |
| Node.js + Expo (ADR-007) | Corte 2 | Un solo lenguaje permitió un solo `npm ci` con caché en el pipeline y las mismas herramientas de SCA para backend y app |
| SQLite (`node:sqlite`) | Corte 2 | Un archivo en un volumen de Docker: la copia de seguridad es copiar un archivo y el despliegue no necesita un servidor de base de datos. Fija el límite de una sola instancia (sección 4) |
| SLO del Corte 2 (p95 crear ≤ 500 ms, p95 cola ≤ 300 ms, errores < 1 %) | Corte 2 | Se volvió el umbral de la prueba de carga del pipeline sin cambiar las cifras |
| Umbral de cobertura del núcleo (85 % líneas, 75 % ramas) | Corte 2 | El enunciado pide ≥ 70 %; el umbral no se relajó |

### 2.2 Cambiaron

| Qué | Antes | Ahora | Por qué |
|---|---|---|---|
| Lenguaje del módulo de asignación | Java (Corte 1) | Node.js (Corte 2) | ADR-007. La retroalimentación del profesor señaló que en la entrega del Corte 2 esta decisión aparecía solo como "restricción del equipo", sin alternativas ni costo; se registró como ADR-007 el 2026-10-27 |
| Concurrencia | Singleton `synchronized` (Corte 1) | Bloqueo optimista en la base de datos (Corte 2) | ADR-002: Node tiene un solo hilo y la consistencia pasó a la base |
| `JWT_SECRET` | Valor de desarrollo por defecto en `server.js` | Obligatorio: el backend no arranca sin él; en el servidor viene de GitHub Environments | Un secreto escrito en el código terminaría en producción (amenaza A2 de [seguridad.md](seguridad.md)) |
| Cómo se entrega la app web | `npx expo start` en el computador de un integrante | Contenedor `web`: nginx sin root sirve la app exportada y pasa `/api` y `/socket.io` al backend | Una sola URL pública y un `depends_on: service_healthy` real en Compose |
| Dónde se miden las pruebas | En el computador de un integrante | Unitarias, integración, arquitectura y seguridad en runners de GitHub; la carga del SLO en el runner del servidor contra lo desplegado | Ver [ADR-008](adr/ADR-008-estrategia-de-despliegue.md): desde EE. UU. la red pesaba más que el servidor |
| Cuentas de usuario | Solo las de demostración, cargadas desde el código | Consola de usuarios (`src/adapters/in/cli/usuarios.js` + caso de uso `GestionarUsuarios`) para crear el coordinador real, cambiar claves y retirar las de demostración | La organización necesita crear su primer administrador sin editar el código ([implementacion.md §5.7](implementacion.md#57-primer-despliegue-primer-coordinador-y-cuentas-de-demostración)) |
| Actualización de dependencias | A mano | Dependabot semanal agrupado; Expo, React y React Native solo con `npx expo install --fix` | Dependabot propuso versiones incompatibles con el SDK 57 (PR #21); el job Construcción ahora lo detecta |
| Flujo de trabajo en Git | Commits directos a `main` (septiembre) | Ramas + PR + aprobación de otro integrante + 8 checks (ruleset `proteger-main`, sin excepciones) | Lo exige el enunciado; ver [devops.md §1](devops.md#1-el-camino-de-un-cambio) |

## 3. Pendientes del Corte 2 y cómo se resolvieron

Los pendientes vienen de la sección 7 de [arquitectura.md](arquitectura.md#7-límites-conocidos-del-diseño-y-trabajo-pendiente-para-el-corte-3), de "Lo que no se logró resolver por completo" del README del Corte 2 y de la retroalimentación del profesor. El enunciado del Corte 3 no pide funcionalidades de negocio nuevas, así que los pendientes que son funcionalidades se declaran como límites con lo que haría falta.

| # | Pendiente declarado en el Corte 2 | Estado en el Corte 3 | Cómo se resolvió o por qué no |
|---|---|---|---|
| 1 | Un solo proceso y SQLite; escalar exige PostgreSQL | **Límite conocido** | Se mantiene a propósito (ver sección 4). Lo que cambió: los manifiestos de Kubernetes dejan el backend en 1 réplica con un PVC y la web en 2, y la vista de despliegue lo muestra. Para varias instancias: adaptador PostgreSQL detrás de los mismos puertos (volverlos asíncronos) y Socket.IO con un adaptador compartido (Redis) |
| 2 | La cola se recalcula en cada consulta; quiebre a ≈140 solicitudes/s | **Vigilado por el pipeline** | No se cambió el algoritmo, pero ahora una regresión de rendimiento no pasa: la prueba de carga corre después de cada despliegue y falla si el p95 de la cola supera 300 ms. Prometheus alerta con el mismo umbral sobre el tráfico real. En el Corte 2 una regresión así (≈97 sol/s) solo se encontró porque alguien corrió la prueba de estrés a mano |
| 3 | Sin notificaciones push con la app cerrada | **Límite conocido** (funcionalidad nueva) | Fuera del alcance del Corte 3. Haría falta un adaptador de Expo Notifications detrás del puerto `PublicadorEventos` |
| 4 | Autenticación básica: claves locales, JWT de 8 h, sin directorio institucional ni cierre de sesión en el servidor | **Resuelto en parte** | `JWT_SECRET` obligatorio y por entorno; consola de usuarios para crear cuentas, cambiar claves (mínimo 10 caracteres) y retirar las de demostración; la autenticación y la autorización quedaron en el modelo de amenazas con su verificación (A1 a A4). Sigue sin directorio institucional, sin límite de intentos (riesgo R-01) y sin revocar tokens |
| 5 | Pesos de prioridad y mapa de cercanía inventados por el equipo | **Límite conocido** | Requiere datos del área de soporte real. Ya están separados del código de negocio (`PoliticaImpactoYEspera`, `MAPA_CERCANIA` en `datosIniciales.js`), así que cambiarlos no toca casos de uso |
| 6 | Un técnico que no responde puede volver a recibir otra solicitud | **Límite conocido** (funcionalidad nueva) | Fuera del alcance. Haría falta una regla en el dominio (`GestorAsignaciones`) que penalice al técnico escalado durante un tiempo |
| 7 | Sin reintento automático ante `ConflictoConcurrencia` | **Analizado y no se implementa** | En un solo proceso no puede ocurrir: cada transacción es síncrona (`node:sqlite`) y empieza con `BEGIN IMMEDIATE`, así que dos transacciones nunca se intercalan. El conflicto solo aparece con varias instancias, que no se despliegan (punto 1). Un reintento genérico sería peligroso: en `CrearSolicitud` la solicitud se crea fuera de la transacción y se asigna dentro, y reintentar todo podría duplicarla. Si algún día hay varias instancias, el reintento va en el caso de uso, con una prueba de concurrencia real |
| 8 | Bonificaciones del Corte 2 no hechas (pruebas de UI con Cypress/Selenium, evaluación SUS) | **Sigue igual** | Las pruebas de UI existen con Playwright (7 flujos, `e2e/`), pero no corren en el pipeline (necesitan Chromium y la app exportada; se corren a mano antes de cambios de la app). La evaluación SUS requiere usuarios reales. En el Corte 3 se hicieron sus tres bonificaciones: Kubernetes, observabilidad y DAST |
| 9 | "Para el Corte 3": CI/CD con pruebas, cobertura y carga en cada push; análisis de dependencias y secretos; `JWT_SECRET` con valor por defecto | **Resuelto** | Todo el Corte 3: [devops.md](devops.md) y [seguridad.md](seguridad.md). El secreto por defecto se eliminó en el PR #1 y el historial se revisa con Gitleaks |
| 10 | Campos del prototipo que cambiamos (edificio y salón de una lista, horas en bloques fijos) | **Decisión vigente** | Se mantiene: evita solicitudes para salones que no existen |
| 11 | Datos de demostración (sedes, edificios, técnicos) | **Documentado para el negocio** | La guía explica cómo cambiar los datos iniciales antes del primer despliegue y cómo reemplazar las cuentas de demostración ([implementacion.md §5.6 y §5.7](implementacion.md#56-cargar-los-datos-iniciales)) |
| 12 | Retroalimentación del profesor: la migración de Java a Node no tenía ADR | **Resuelto** | ADR-007 con alternativas, costo y trazabilidad clase por clase (registrado el 2026-10-27, antes del Corte 3) |

## 4. Límites conocidos del sistema final

1. **Una sola instancia del backend.** SQLite es un archivo local y Socket.IO guarda las salas en la memoria del proceso. El sistema aguanta ≈140 solicitudes/s (prueba de estrés del Corte 2), muy por encima de lo que piden 2 sedes y 4 técnicos, pero no escala horizontalmente ni sobrevive a la caída de su servidor sin un reinicio.
2. **Disponibilidad doméstica.** Producción corre en una VM del servidor de un integrante: depende de su luz y su Internet. Para la semana de presentación y calificación (15 al 23 de noviembre) el servidor se mantiene encendido. La recomendación para el negocio está en [implementacion.md §9](implementacion.md#9-recomendaciones-para-producción).
3. **Pruebas y producción comparten la VM.** Una prueba de carga pesada podría afectar a producción.
4. **El SLO del pipeline no incluye la red pública:** se mide desde el servidor (ADR-008). La prueba de humo sí entra por Internet.
5. **Riesgos de seguridad aceptados** ([seguridad.md §3](seguridad.md#3-registro-de-hallazgos)): `decode-uri-component` en la app hasta migrar a Expo SDK 58 (H-01), sin CSP (H-09a), sin límite de intentos de inicio de sesión ni de peticiones (R-01, R-02), CORS abierto (R-05).
6. **Funcionalidades pendientes:** notificaciones push, penalizar al técnico que no responde, integración con el directorio institucional, revocación de sesiones.
7. **Las pruebas de Playwright no están en el pipeline.**

## 5. Qué haríamos distinto

- **Contenerizar y montar el pipeline desde el Corte 2.** Las pruebas existían, pero corrían en el computador de cada uno. La primera vez que corrieron en un entorno limpio aparecieron problemas que nadie había visto: vulnerabilidades en las imágenes, JWT guardados en los resultados de k6 y un secreto por defecto en el historial.
- **Registrar las decisiones cuando se toman.** El ADR-007 se escribió después, por la retroalimentación; el ADR-008 tuvo que agregar un ajuste (dónde se mide el SLO) que se habría visto antes con una prueba desde el principio.
- **Medir desde el lugar correcto antes de fijar un umbral.** El SLO medido por Internet variaba casi al doble entre ejecuciones; una prueba de carga que depende de la red pone en riesgo la rama principal sin decir nada del código.
- **Pensar en quien instala el sistema.** Hasta escribir la guía, crear el primer administrador exigía editar el código. Una guía escrita desde el principio habría mostrado ese hueco en el Corte 2.
