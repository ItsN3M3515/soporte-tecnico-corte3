const crypto = require('node:crypto');
const { verificarPuerto } = require('../ports/puertos');
const { FabricaSolicitudes } = require('../domain/modelo/FabricaSolicitudes');
const { GestorAsignaciones } = require('../domain/asignacion/GestorAsignaciones');
const { PoliticaImpactoYEspera } = require('../domain/prioridad/politicas');
const {
  BusquedaPorEdificio,
  FallbackCercaniaDecorator,
  CualquieraDeLaSedeDecorator,
  MapaCercania,
} = require('../domain/busqueda/busqueda');
const { construirCadenaEscalacion } = require('../domain/escalacion/cadena');
const { CrearSolicitud } = require('../application/CrearSolicitud');
const { AsignarManualmente } = require('../application/AsignarManualmente');
const { ActivarProgramadas } = require('../application/ActivarProgramadas');
const { NotificacionesDocente } = require('../application/NotificacionesDocente');
const { AtenderSolicitud } = require('../application/AtenderSolicitud');
const { EscalarVencidas } = require('../application/EscalarVencidas');
const { Consultas } = require('../application/Consultas');
const { Autenticar } = require('../application/Autenticar');
const { GestionarUsuarios } = require('../application/GestionarUsuarios');
const { abrirBaseDatos } = require('../adapters/out/persistence/sqlite/baseDatos');
const repos = require('../adapters/out/persistence/sqlite/repositorios');
const { PublicadorSocketIO } = require('../adapters/out/realtime/PublicadorSocketIO');
const { RelojSistema } = require('../adapters/out/reloj/RelojSistema');
const { CredencialesJWT } = require('../adapters/out/seguridad/CredencialesJWT');
const { MAPA_CERCANIA } = require('./datosIniciales');

/**
 * Números de solicitud cortos y consecutivos (S-0001, S-0002...), como en el prototipo (#S-0231).
 * Arranca desde el mayor número guardado; Node atiende las peticiones en un solo hilo,
 * así que dos solicitudes simultáneas no pueden recibir el mismo número dentro del proceso.
 */
function generadorConsecutivo(db) {
  const { mayor } = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id, 3) AS INTEGER)), 0) AS mayor FROM solicitudes WHERE id LIKE 'S-%'").get();
  let n = Number(mayor);
  return () => {
    n += 1;
    return `S-${String(n).padStart(4, '0')}`;
  };
}

/**
 * RAÍZ DE COMPOSICIÓN (hexagonal): el ÚNICO lugar donde se conectan los
 * adaptadores concretos con los puertos del núcleo. Las pruebas de integración
 * llaman a esta misma función con una BD ':memory:' y un reloj controlable.
 */
function crearContenedor({
  rutaBd = ':memory:',
  secretoJwt = 'secreto-de-desarrollo',
  reloj = new RelojSistema(),
  publicador = new PublicadorSocketIO(),
  minutosSinRespuesta = 5,
  minutosEnCola = 10,
  minutosAnticipacion = 30,
  log = console,
} = {}) {
  const db = abrirBaseDatos(rutaBd);

  const repoSolicitudes = verificarPuerto('RepositorioSolicitudes', new repos.RepositorioSolicitudesSqlite(db));
  const repoTecnicos = verificarPuerto('RepositorioTecnicos', new repos.RepositorioTecnicosSqlite(db));
  const repoEquipos = verificarPuerto('RepositorioEquipos', new repos.RepositorioEquiposSqlite(db));
  const repoUsuarios = verificarPuerto('RepositorioUsuarios', new repos.RepositorioUsuariosSqlite(db));
  const unidadDeTrabajo = verificarPuerto('UnidadDeTrabajo', new repos.UnidadDeTrabajoSqlite(db));
  const repoNotificaciones = verificarPuerto('RepositorioNotificaciones', new repos.RepositorioNotificacionesSqlite(db));
  const credenciales = verificarPuerto('ServicioCredenciales', new CredencialesJWT(secretoJwt));
  verificarPuerto('PublicadorEventos', publicador);
  verificarPuerto('Reloj', reloj);

  // Decorator: el publicador que reciben los casos de uso también guarda las notificaciones del docente.
  const notificaciones = new NotificacionesDocente({
    publicador, repoNotificaciones, repoTecnicos, reloj, log, generadorId: () => `N-${crypto.randomUUID()}`,
  });

  // Búsqueda: edificio → edificios cercanos → cualquiera de la sede (dos Decorators)
  const busqueda = new CualquieraDeLaSedeDecorator(
    new FallbackCercaniaDecorator(new BusquedaPorEdificio(), new MapaCercania(MAPA_CERCANIA)),
  );
  const gestor = new GestorAsignaciones({ busqueda, politicaPrioridad: new PoliticaImpactoYEspera() });
  const fabrica = new FabricaSolicitudes(generadorConsecutivo(db));
  const cadena = construirCadenaEscalacion(gestor);

  const base = { repoSolicitudes, repoTecnicos, repoEquipos, unidadDeTrabajo, gestor, publicador: notificaciones, reloj };
  return {
    db,
    log,
    reloj,
    publicador: notificaciones,
    credenciales,
    repoSolicitudes,
    repoTecnicos,
    repoEquipos,
    repoUsuarios,
    repoNotificaciones,
    unidadDeTrabajo,
    gestor,
    notificaciones,
    crearSolicitud: new CrearSolicitud({ ...base, fabrica }),
    atender: new AtenderSolicitud(base),
    asignarManualmente: new AsignarManualmente(base),
    activarProgramadas: new ActivarProgramadas({ ...base, minutosAnticipacion }),
    escalarVencidas: new EscalarVencidas({ ...base, cadena, minutosSinRespuesta, minutosEnCola }),
    consultas: new Consultas(base),
    autenticar: new Autenticar({ repoUsuarios, credenciales }),
    gestionarUsuarios: new GestionarUsuarios({ repoUsuarios, credenciales, repoEquipos }),
  };
}

module.exports = { crearContenedor };
