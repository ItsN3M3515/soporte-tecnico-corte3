const express = require('express');
const cors = require('cors');
const { crearMetricas } = require('./metricas');
const { CodigoQR } = require('../../../domain/modelo/CodigoQR');
const { problemasDe } = require('../../../domain/modelo/problemasEquipo');
const { Rol } = require('../../../domain/modelo/enums');
const { NoEncontrado, DatoInvalido } = require('../../../domain/errores');

/**
 * Adaptador de ENTRADA HTTP (Express). Solo traduce HTTP ↔ casos de uso:
 * no contiene reglas de negocio.
 */
const HTTP_POR_ERROR = {
  DATO_INVALIDO: 400,
  ACCESO_DENEGADO: 403,
  NO_ENCONTRADO: 404,
  TRANSICION_INVALIDA: 409,
  CONFLICTO_CONCURRENCIA: 409,
};

function crearApp(c) {
  const app = express();
  // No anunciar la tecnología del servidor (hallazgo de ZAP 10037)
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '20kb' }));

  // --- Observabilidad: latencia, errores y throughput para Prometheus (ver metricas.js) ---
  const metricas = crearMetricas(c);
  app.use(metricas.medir);
  app.get('/metrics', metricas.exponer);

  // --- Autenticación y roles ---
  const autenticado = (req, res, next) => {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Falta el token de sesión.' });
    }
    try {
      req.usuario = c.credenciales.leerToken(token);
      return next();
    } catch (e) {
      return res.status(401).json({ error: e.message });
    }
  };
  const soloRoles = (...roles) => (req, res, next) =>
    roles.includes(req.usuario.rol) ? next() : res.status(403).json({ error: `Requiere rol ${roles.join(' o ')}.` });
  const tecnicoIdDe = (req) => {
    if (!req.usuario.tecnicoId) throw new NoEncontrado('El usuario no está vinculado a un técnico.');
    return req.usuario.tecnicoId;
  };

  // --- Rutas ---
  app.get('/api/salud', (req, res) => res.json({ estado: 'ok' }));

  app.post('/api/auth/login', (req, res) => res.json(c.autenticar.ejecutar(req.body || {})));

  // Previsualizar el equipo al escanear, antes de enviar la solicitud.
  app.get('/api/qr/resolver', autenticado, (req, res) => {
    const { codigoEquipo } = CodigoQR.desdeTexto(req.query.qr);
    const equipo = c.repoEquipos.buscarPorCodigo(codigoEquipo);
    if (!equipo) throw new NoEncontrado(`El equipo ${codigoEquipo} no está registrado.`);
    res.json({ ...equipo, problemas: problemasDe(equipo.descripcion) });
  });

  // Selectores de "Edificio y salón" y búsqueda manual cuando el QR no se puede leer.
  app.get('/api/ubicaciones', autenticado, (req, res) => res.json(c.consultas.ubicaciones()));
  app.get('/api/equipos', autenticado, (req, res) => {
    const { edificio, salon } = req.query;
    if (typeof edificio !== 'string' || typeof salon !== 'string') throw new DatoInvalido('Indique edificio y salón.');
    res.json(c.consultas.equiposDeSalon(edificio, salon).map((e) => ({ ...e, problemas: problemasDe(e.descripcion) })));
  });

  // Pantalla "¿Qué le pasa?" después de escanear: el equipo y los problemas que le pueden pasar.
  app.get('/api/equipos/:codigo', autenticado, (req, res) => {
    const equipo = c.repoEquipos.buscarPorCodigo(String(req.params.codigo));
    if (!equipo) throw new NoEncontrado(`El equipo ${req.params.codigo} no está registrado.`);
    res.json({ ...equipo, problemas: problemasDe(equipo.descripcion) });
  });

  // Todas las pantallas de "Nueva solicitud": falla (qr o codigoEquipo), préstamo, mantenimiento, evento, falla eléctrica.
  app.post('/api/solicitudes', autenticado, soloRoles(Rol.DOCENTE, Rol.ESTUDIANTE, Rol.ADMIN), (req, res) => {
    const { qr, codigoEquipo, ubicacion, tipo, detalle, datos, claseEnCurso, programadaPara } = req.body || {};
    const solicitud = c.crearSolicitud.ejecutar({
      qr, codigoEquipo, ubicacion, tipo, detalle, datos, claseEnCurso, programadaPara, usuario: req.usuario.usuario,
    });
    res.status(201).json(solicitud);
  });

  app.get('/api/solicitudes/mias', autenticado, (req, res) => res.json(c.consultas.misSolicitudes(req.usuario.usuario)));
  app.get('/api/solicitudes/:id', autenticado, (req, res) => res.json(c.consultas.estadoSolicitud(req.params.id, req.usuario)));

  app.get('/api/notificaciones', autenticado, (req, res) => res.json(c.notificaciones.listar(req.usuario.usuario)));
  app.post('/api/notificaciones/leidas', autenticado, (req, res) => res.json(c.notificaciones.marcarLeidas(req.usuario.usuario)));

  // ?limite=N (1..500, por defecto 50): cuántas solicitudes de la cola devolver.
  app.get('/api/sedes/:sede/cola', autenticado, soloRoles(Rol.TECNICO, Rol.ADMIN), (req, res) => {
    const limite = req.query.limite === undefined ? undefined : Number(req.query.limite);
    if (limite !== undefined && !(Number.isInteger(limite) && limite >= 1 && limite <= 500)) {
      throw new DatoInvalido('El límite debe ser un entero entre 1 y 500.');
    }
    res.json(c.consultas.colaDeSede(req.params.sede, limite));
  });

  const tecnico = express.Router();
  tecnico.use(autenticado, soloRoles(Rol.TECNICO));
  tecnico.get('/panel', (req, res) => res.json(c.consultas.panelTecnico(tecnicoIdDe(req))));
  tecnico.post('/aceptar', (req, res) => res.json(c.atender.aceptar(tecnicoIdDe(req))));
  tecnico.post('/llegada', (req, res) => res.json(c.atender.confirmarLlegada(tecnicoIdDe(req))));
  tecnico.post('/finalizar', (req, res) => res.json(c.atender.finalizar(tecnicoIdDe(req))));
  tecnico.post('/cancelar', (req, res) => res.json(c.atender.cancelar(tecnicoIdDe(req))));
  app.use('/api/tecnicos/yo', tecnico);

  const admin = express.Router();
  admin.use(autenticado, soloRoles(Rol.ADMIN));
  admin.get('/demanda', (req, res) => res.json(c.consultas.demandaPorSede()));
  admin.get('/tecnicos', (req, res) => res.json(c.repoTecnicos.listar({}).map((t) => t.aVista())));
  admin.get('/equipos', (req, res) => res.json(c.repoEquipos.listar()));
  admin.post('/escalar', (req, res) => res.json(c.escalarVencidas.ejecutar()));
  admin.get('/resumen', (req, res) => res.json(c.consultas.resumenHoy()));
  admin.get('/escaladas', (req, res) => res.json(c.consultas.escaladas()));
  admin.post('/solicitudes/:id/asignar', (req, res) => {
    const { tecnicoId } = req.body || {};
    if (typeof tecnicoId !== 'string' || !tecnicoId) throw new DatoInvalido('Elija el técnico.');
    res.json(c.asignarManualmente.ejecutar({ solicitudId: req.params.id, tecnicoId }));
  });
  app.use('/api/admin', admin);

  app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));

  // --- Traducción de errores de dominio a HTTP ---
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado.' });
    const status = HTTP_POR_ERROR[err.codigo];
    if (status) return res.status(status).json({ error: err.message, codigo: err.codigo });
    c.log?.error?.(err);
    return res.status(500).json({ error: 'Error interno.' });
  });

  return app;
}

module.exports = { crearApp };
