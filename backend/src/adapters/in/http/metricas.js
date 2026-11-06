const client = require('prom-client');

/**
 * Adaptador de OBSERVABILIDAD: métricas en formato Prometheus en GET /metrics.
 * Es infraestructura (prom-client), así que vive en un adaptador y el núcleo no sabe que existe.
 *
 * Métricas ligadas al SLO del Corte 2 (tablero de Grafana en observabilidad/):
 *  - http_request_duration_seconds{metodo, ruta, codigo}: latencia por ruta. Los cubos 0.3 y 0.5
 *    coinciden con los umbrales del SLO (cola ≤ 300 ms, crear ≤ 500 ms), así el p95 es exacto en el borde.
 *    Su _count da el throughput y, filtrando codigo=~"5..", la tasa de error.
 *  - asistec_solicitudes_* y asistec_tecnicos_disponibles por sede: estado de la cola y del personal,
 *    leídos de la consulta del panel del coordinador en cada lectura de Prometheus.
 *  - Métricas del proceso de Node (memoria, CPU, event loop) con el prefijo asistec_.
 * /metrics no pasa por nginx (solo /api y /socket.io), así que no se publica en internet.
 */
function crearMetricas(c) {
  const registro = new client.Registry();
  client.collectDefaultMetrics({ register: registro, prefix: 'asistec_' });

  const duracion = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duración de las peticiones HTTP a la API',
    labelNames: ['metodo', 'ruta', 'codigo'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2.5, 5],
    registers: [registro],
  });

  const porSede = (nombre, ayuda, valorDe) =>
    new client.Gauge({
      name: nombre,
      help: ayuda,
      labelNames: ['sede'],
      registers: [registro],
      collect() {
        this.reset();
        c.consultas.demandaPorSede().forEach((d) => this.set({ sede: d.sede }, valorDe(d)));
      },
    });
  porSede('asistec_solicitudes_en_cola', 'Solicitudes esperando técnico', (d) => d.enCola);
  porSede('asistec_solicitudes_escaladas', 'Solicitudes escaladas al coordinador sin resolver', (d) => d.escaladas);
  porSede('asistec_solicitudes_en_atencion', 'Solicitudes asignadas o en atención', (d) => d.enAtencion);
  porSede('asistec_tecnicos_disponibles', 'Técnicos libres', (d) => d.tecnicosDisponibles);

  /** Middleware: mide cada petición. La ruta es el patrón de Express (/api/solicitudes/:id), no la URL. */
  const medir = (req, res, next) => {
    const fin = duracion.startTimer();
    res.on('finish', () => {
      const ruta = req.route ? `${req.baseUrl}${req.route.path}` : 'sin_ruta';
      fin({ metodo: req.method, ruta, codigo: String(res.statusCode) });
    });
    next();
  };

  const exponer = async (req, res) => {
    res.set('Content-Type', registro.contentType);
    res.end(await registro.metrics());
  };

  return { medir, exponer };
}

module.exports = { crearMetricas };
