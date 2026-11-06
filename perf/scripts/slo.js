/**
 * PRUEBA DEL SLO EN EL PIPELINE (corta). Corre después de cada despliegue, contra el entorno
 * de pruebas recién desplegado (cd.yml → scripts/slo.sh), después de la prueba de humo.
 * Es el baseline del Corte 2 acortado a 30 s; la prueba larga (pico.js) corre en slo-larga.yml.
 *
 * SLO del Corte 2, escrito como thresholds: si alguno no se cumple, k6 termina con error
 * y el pipeline falla.
 *   crear_solicitud  p95 ≤ 500 ms
 *   consultar_cola   p95 ≤ 300 ms
 *   errores          < 1 %
 * Variables: API_URL (por ejemplo https://<host>/api), DURACION (por defecto 30s).
 */
import { sleep } from 'k6';
import { prepararDatos, crearSolicitud, consultarCola, consultarDemanda, cicloTecnico } from './comun.js';

const DURACION = __ENV.DURACION || '30s';

export const options = {
  scenarios: {
    docentes: { executor: 'constant-arrival-rate', rate: 2, timeUnit: '1s', duration: DURACION, preAllocatedVUs: 10, exec: 'docentes' },
    pantallas: { executor: 'constant-arrival-rate', rate: 5, timeUnit: '1s', duration: DURACION, preAllocatedVUs: 10, exec: 'pantallas' },
    tecnicos: { executor: 'constant-vus', vus: 4, duration: DURACION, exec: 'tecnicos' },
  },
  thresholds: {
    'http_req_duration{nombre:crear_solicitud}': ['p(95)<500'],
    'http_req_duration{nombre:consultar_cola}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export const setup = prepararDatos;
export function docentes(datos) { crearSolicitud(datos); }
export function pantallas(datos) { if (Math.random() < 0.8) consultarCola(datos); else consultarDemanda(datos); }
export function tecnicos(datos) { cicloTecnico(datos, __VU); sleep(2); }

/**
 * Resumen sin datos sensibles: k6 guarda en el resumen lo que devuelve setup(), que incluye
 * los JWT de la prueba. Contra un entorno desplegado serían tokens válidos publicados como
 * artefacto, así que se quitan (hallazgo H-02 de docs/seguridad.md).
 */
export function handleSummary(data) {
  const { setup_data: _omitido, ...resumen } = data;
  const m = data.metrics;
  const p95 = (nombre) => m[nombre]?.values?.['p(95)']?.toFixed(1) ?? 'n/d';
  const texto = [
    'SLO en el entorno desplegado',
    `  p95 crear solicitud: ${p95('http_req_duration{nombre:crear_solicitud}')} ms (umbral 500)`,
    `  p95 consultar cola:  ${p95('http_req_duration{nombre:consultar_cola}')} ms (umbral 300)`,
    `  errores: ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)} % (umbral 1 %)`,
    `  peticiones: ${m.http_reqs?.values?.count ?? 0}`,
    '',
  ].join('\n');
  return { stdout: texto, [__ENV.RESUMEN || 'reportes/slo-resumen.json']: JSON.stringify(resumen, null, 2) };
}
