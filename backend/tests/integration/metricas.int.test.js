const { crearEntorno } = require('./entorno');

/**
 * Integración: adaptador de observabilidad (prom-client) sobre la API real.
 * Las métricas alimentan el tablero de Grafana del SLO (observabilidad/).
 */
describe('Métricas para Prometheus (GET /metrics)', () => {
  let e;

  beforeEach(() => {
    e = crearEntorno();
  });

  test('mide cada petición con el patrón de la ruta, no con la URL concreta', async () => {
    // Arrange: una solicitud consultada por id
    await e.como('docente').get('/api/solicitudes/no-existe');

    // Act
    const res = await e.api.get('/metrics');

    // Assert: una sola serie para todas las solicitudes (el id no explota la cardinalidad)
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/http_request_duration_seconds_count\{metodo="GET",ruta="\/api\/solicitudes\/:id",codigo="404"\} 1/);
    expect(res.text).not.toMatch(/no-existe/);
  });

  test('los cubos del histograma incluyen los umbrales del SLO (300 ms y 500 ms)', async () => {
    await e.api.get('/api/salud');
    const res = await e.api.get('/metrics');
    expect(res.text).toMatch(/le="0\.3"/);
    expect(res.text).toMatch(/le="0\.5"/);
  });

  test('expone la cola y los técnicos disponibles por sede', async () => {
    // Arrange: la docente reporta una falla y queda asignada a un técnico del CAMPUS
    await e.como('docente').post('/api/solicitudes', {
      qr: 'SOPORTE:v1:CAM-K-101-VB01',
      tipo: 'FALLA_EQUIPO_FIJO',
      claseEnCurso: true,
      datos: { problema: 'SIN_IMAGEN' },
    });

    // Act
    const res = await e.api.get('/metrics');

    // Assert
    expect(res.text).toMatch(/asistec_solicitudes_en_atencion\{sede="CAMPUS"\} 1/);
    expect(res.text).toMatch(/asistec_tecnicos_disponibles\{sede="NORTE"\} \d+/);
    expect(res.text).toMatch(/asistec_solicitudes_en_cola\{sede="CAMPUS"\} 0/);
  });

  test('las rutas inexistentes se agrupan en una sola serie', async () => {
    await e.api.get('/api/inventada/123');
    const res = await e.api.get('/metrics');
    expect(res.text).toMatch(/ruta="sin_ruta",codigo="404"/);
  });
});
