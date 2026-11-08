/**
 * PUERTOS (arquitectura hexagonal).
 *
 * Son los contratos que el núcleo (dominio + aplicación) necesita del mundo exterior.
 * JavaScript no tiene interfaces, así que se documentan con JSDoc y se verifican con
 * `verificarPuerto` al armar el contenedor: si un adaptador no cumple el contrato,
 * la aplicación falla al arrancar y no en mitad de una petición.
 *
 * Regla de dependencia: src/domain y src/application NUNCA importan nada de
 * src/adapters (ni express, ni socket.io, ni node:sqlite). La prueba
 * tests/unit/arquitectura.test.js lo verifica automáticamente.
 *
 * Nota: los repositorios son síncronos porque el adaptador usa node:sqlite (DatabaseSync),
 * cuyas transacciones son síncronas. Eso hace atómica la asignación dentro de una
 * instancia; entre instancias la protege el bloqueo optimista (ConflictoConcurrencia).
 */

const PUERTOS = {
  /**
   * RepositorioSolicitudes
   *  guardar(solicitud): void
   *  buscarPorId(id): Solicitud | null
   *  listarAbiertas({ sede? }): Solicitud[]          (todo lo que no está RESUELTA)
   *  listarDesde(timestampMs): Solicitud[]            (para métricas del panel admin)
   *  listarConActividadDesde(ts): Solicitud[]         (creadas, escaladas o resueltas desde ts: tarjetas "hoy")
   *  listarPorCreador(usuario, limite): Solicitud[]   (pantalla "Mis solicitudes", la más reciente primero)
   */
  RepositorioSolicitudes: ['guardar', 'buscarPorId', 'listarAbiertas', 'listarDesde', 'listarConActividadDesde', 'listarPorCreador'],

  /**
   * RepositorioTecnicos
   *  guardar(tecnico): void   — lanza ConflictoConcurrencia si `version` cambió
   *  buscarPorId(id): Tecnico | null
   *  listar({ sede? }): Tecnico[]
   */
  RepositorioTecnicos: ['guardar', 'buscarPorId', 'listar'],

  /**
   * RepositorioEquipos
   *  buscarPorCodigo(codigo): {codigo, salon, edificio, sede, descripcion} | null
   *  listar(): Equipo[]
   *  listarPorSalon(edificio, salon): Equipo[]         (búsqueda manual y validación de ubicaciones)
   */
  RepositorioEquipos: ['buscarPorCodigo', 'listar', 'listarPorSalon'],

  /**
   * RepositorioNotificaciones
   *  guardar({id, usuario, solicitudId, tipo, titulo, mensaje, creadaEn, leida}): void
   *  listarPorUsuario(usuario, limite): Notificacion[]  (la más reciente primero)
   *  marcarLeidas(usuario): number
   */
  RepositorioNotificaciones: ['guardar', 'listarPorUsuario', 'marcarLeidas'],

  /**
   * RepositorioUsuarios
   *  buscarPorUsuario(usuario): {usuario, nombre, rol, sede, tecnicoId, correo, hashClave} | null
   *  guardar(usuario): void                 (crea o reemplaza)
   *  eliminar(usuario): boolean             (true si existía)
   *  listar(): {usuario, nombre, rol, sede, tecnicoId, correo}[]   (sin el hash de la clave)
   */
  RepositorioUsuarios: ['buscarPorUsuario', 'guardar', 'eliminar', 'listar'],

  /** UnidadDeTrabajo — ejecutar(fn): resultado de fn, todo o nada (transacción) */
  UnidadDeTrabajo: ['ejecutar'],

  /**
   * PublicadorEventos (salida en tiempo real)
   *  publicar(evento, datos, destinos: string[]): void
   *  destinos: 'admin', 'sede:<sede>', 'tecnico:<id>', 'usuario:<usuario>'
   */
  PublicadorEventos: ['publicar'],

  /** Reloj — ahora(): number (ms). Se inyecta para poder probar el aging y la escalación sin esperar. */
  Reloj: ['ahora'],

  /**
   * ServicioCredenciales — verificarClave(clave, hash): boolean ; hashearClave(clave): string ;
   * emitirToken(usuario): string ; leerToken(token): usuario
   */
  ServicioCredenciales: ['verificarClave', 'hashearClave', 'emitirToken', 'leerToken'],
};

function verificarPuerto(nombrePuerto, adaptador) {
  const metodos = Object.hasOwn(PUERTOS, nombrePuerto) ? PUERTOS[nombrePuerto] : null; // eslint-disable-line security/detect-object-injection -- clave validada con hasOwn
  if (!metodos) throw new Error(`Puerto desconocido: ${nombrePuerto}`);
  const faltantes = metodos.filter((m) => typeof adaptador?.[m] !== 'function'); // eslint-disable-line security/detect-object-injection -- m viene de la lista fija del puerto
  if (faltantes.length > 0) {
    throw new Error(`El adaptador de ${nombrePuerto} no implementa: ${faltantes.join(', ')}`);
  }
  return adaptador;
}

module.exports = { PUERTOS, verificarPuerto };
