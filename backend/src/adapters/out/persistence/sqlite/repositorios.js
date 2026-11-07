const { Solicitud } = require('../../../../domain/modelo/Solicitud');
const { Tecnico } = require('../../../../domain/tecnicos/Tecnico');
const { ConflictoConcurrencia } = require('../../../../domain/errores');

/**
 * Adaptadores de salida que implementan los puertos de repositorio con SQLite.
 * Traducen filas ↔ entidades del dominio. El dominio no sabe que existe SQL.
 */

const leerJson = (texto) => {
  try {
    return JSON.parse(texto || '{}');
  } catch {
    return {};
  }
};

const filaASolicitud = (f) =>
  new Solicitud({
    id: f.id,
    codigoEquipo: f.codigo_equipo,
    descripcionEquipo: f.descripcion_equipo,
    salon: f.salon,
    edificio: f.edificio,
    sede: f.sede,
    tipo: f.tipo,
    detalle: f.detalle,
    datos: leerJson(f.datos),
    claseEnCurso: f.clase_en_curso === 1,
    estado: f.estado,
    tecnicoId: f.tecnico_id,
    creadaPor: f.creada_por,
    creadaEn: f.creada_en,
    programadaPara: f.programada_para,
    activadaEn: f.activada_en,
    asignadaEn: f.asignada_en,
    resueltaEn: f.resuelta_en,
    escaladaEn: f.escalada_en,
    motivoEscalacion: f.motivo_escalacion,
  });

// node:sqlite rechaza `undefined`: los campos opcionales se mandan como NULL.
const OPCIONALES = ['codigoEquipo', 'descripcionEquipo', 'detalle', 'tecnicoId', 'creadaPor', 'programadaPara',
  'activadaEn', 'asignadaEn', 'resueltaEn', 'escaladaEn', 'motivoEscalacion'];

function solicitudAParametros(s) {
  const params = { id: s.id, salon: s.salon, edificio: s.edificio, sede: s.sede, tipo: s.tipo, estado: s.estado, creadaEn: s.creadaEn };
  OPCIONALES.forEach((campo) => {
    params[campo] = s[campo] ?? null; // eslint-disable-line security/detect-object-injection -- campo sale de la lista fija OPCIONALES
  });
  params.datos = JSON.stringify(s.datos ?? {});
  params.claseEnCurso = s.claseEnCurso ? 1 : 0;
  return params;
}

class RepositorioSolicitudesSqlite {
  constructor(db) {
    this.db = db;
    this.sql = {
      upsert: db.prepare(`
        INSERT INTO solicitudes (id, codigo_equipo, descripcion_equipo, salon, edificio, sede, tipo, detalle, datos,
                                 clase_en_curso, estado, tecnico_id, creada_por, creada_en, programada_para,
                                 activada_en, asignada_en, resuelta_en, escalada_en, motivo_escalacion)
        VALUES (@id, @codigoEquipo, @descripcionEquipo, @salon, @edificio, @sede, @tipo, @detalle, @datos,
                @claseEnCurso, @estado, @tecnicoId, @creadaPor, @creadaEn, @programadaPara,
                @activadaEn, @asignadaEn, @resueltaEn, @escaladaEn, @motivoEscalacion)
        ON CONFLICT(id) DO UPDATE SET estado = excluded.estado, tecnico_id = excluded.tecnico_id,
               activada_en = excluded.activada_en, asignada_en = excluded.asignada_en,
               resuelta_en = excluded.resuelta_en, escalada_en = excluded.escalada_en,
               motivo_escalacion = excluded.motivo_escalacion`),
      porId: db.prepare('SELECT * FROM solicitudes WHERE id = ?'),
      abiertas: db.prepare("SELECT * FROM solicitudes WHERE estado <> 'RESUELTA' ORDER BY creada_en"),
      abiertasSede: db.prepare("SELECT * FROM solicitudes WHERE estado <> 'RESUELTA' AND sede = ? ORDER BY creada_en"),
      desde: db.prepare('SELECT * FROM solicitudes WHERE creada_en >= ? ORDER BY creada_en'),
      actividadDesde: db.prepare(`SELECT * FROM solicitudes
        WHERE creada_en >= @ts OR resuelta_en >= @ts OR escalada_en >= @ts ORDER BY creada_en`),
      porCreador: db.prepare('SELECT * FROM solicitudes WHERE creada_por = ? ORDER BY creada_en DESC, id DESC LIMIT ?'),
    };
  }

  guardar(s) {
    this.sql.upsert.run(solicitudAParametros(s));
  }

  buscarPorId(id) {
    const f = this.sql.porId.get(id);
    return f ? filaASolicitud(f) : null;
  }

  listarAbiertas({ sede } = {}) {
    const filas = sede ? this.sql.abiertasSede.all(sede) : this.sql.abiertas.all();
    return filas.map(filaASolicitud);
  }

  listarDesde(timestamp) {
    return this.sql.desde.all(timestamp).map(filaASolicitud);
  }

  listarConActividadDesde(timestamp) {
    return this.sql.actividadDesde.all({ ts: timestamp }).map(filaASolicitud);
  }

  listarPorCreador(usuario, limite = 30) {
    return this.sql.porCreador.all(usuario, limite).map(filaASolicitud);
  }
}

const filaATecnico = (f) =>
  new Tecnico({
    id: f.id,
    nombre: f.nombre,
    telefono: f.telefono,
    sede: f.sede,
    edificioBase: f.edificio_base,
    estado: f.estado,
    solicitudActualId: f.solicitud_actual_id,
    version: f.version,
  });

class RepositorioTecnicosSqlite {
  constructor(db) {
    this.db = db;
    this.sql = {
      insertar: db.prepare(`INSERT INTO tecnicos (id, nombre, telefono, sede, edificio_base, estado, solicitud_actual_id, version)
                            VALUES (@id, @nombre, @telefono, @sede, @edificioBase, @estado, @solicitudActualId, 0)`),
      // Bloqueo optimista: solo actualiza si nadie cambió el técnico desde que se leyó.
      actualizar: db.prepare(`UPDATE tecnicos SET estado = @estado, solicitud_actual_id = @solicitudActualId,
                              version = version + 1 WHERE id = @id AND version = @version`),
      existe: db.prepare('SELECT 1 FROM tecnicos WHERE id = ?'),
      porId: db.prepare('SELECT * FROM tecnicos WHERE id = ?'),
      todos: db.prepare('SELECT * FROM tecnicos ORDER BY id'),
      porSede: db.prepare('SELECT * FROM tecnicos WHERE sede = ? ORDER BY id'),
    };
  }

  guardar(t) {
    if (!this.sql.existe.get(t.id)) {
      this.sql.insertar.run({
        id: t.id,
        nombre: t.nombre,
        telefono: t.telefono ?? null,
        sede: t.sede,
        edificioBase: t.edificioBase,
        estado: t.nombreEstado,
        solicitudActualId: t.solicitudActualId ?? null,
      });
      return;
    }
    const { changes } = this.sql.actualizar.run({
      id: t.id,
      estado: t.nombreEstado,
      solicitudActualId: t.solicitudActualId ?? null,
      version: t.version,
    });
    if (changes === 0) {
      throw new ConflictoConcurrencia(`El técnico ${t.id} fue modificado por otra operación. Reintente.`);
    }
    t.version += 1;
  }

  buscarPorId(id) {
    const f = this.sql.porId.get(id);
    return f ? filaATecnico(f) : null;
  }

  listar({ sede } = {}) {
    return (sede ? this.sql.porSede.all(sede) : this.sql.todos.all()).map(filaATecnico);
  }
}

class RepositorioEquiposSqlite {
  constructor(db) {
    this.porCodigo = db.prepare('SELECT codigo, descripcion, salon, edificio, sede FROM equipos WHERE codigo = ?');
    this.todos = db.prepare('SELECT codigo, descripcion, salon, edificio, sede FROM equipos ORDER BY codigo');
    this.porSalon = db.prepare('SELECT codigo, descripcion, salon, edificio, sede FROM equipos WHERE edificio = ? AND salon = ? ORDER BY codigo');
    this.insertar = db.prepare('INSERT OR REPLACE INTO equipos VALUES (@codigo, @descripcion, @salon, @edificio, @sede)');
  }

  buscarPorCodigo(codigo) {
    return this.porCodigo.get(codigo) ?? null;
  }

  listar() {
    return this.todos.all();
  }

  listarPorSalon(edificio, salon) {
    return this.porSalon.all(edificio, salon);
  }

  guardar(e) {
    this.insertar.run({ codigo: e.codigo, descripcion: e.descripcion, salon: e.salon, edificio: e.edificio, sede: e.sede });
  }
}

class RepositorioUsuariosSqlite {
  constructor(db) {
    this.porUsuario = db.prepare('SELECT usuario, nombre, rol, sede, tecnico_id AS tecnicoId, correo, hash_clave AS hashClave FROM usuarios WHERE usuario = ?');
    this.insertar = db.prepare(`INSERT OR REPLACE INTO usuarios (usuario, nombre, rol, sede, tecnico_id, correo, hash_clave)
                                VALUES (@usuario, @nombre, @rol, @sede, @tecnicoId, @correo, @hashClave)`);
    this.borrar = db.prepare('DELETE FROM usuarios WHERE usuario = ?');
    this.todos = db.prepare('SELECT usuario, nombre, rol, sede, tecnico_id AS tecnicoId, correo FROM usuarios ORDER BY rol, usuario');
  }

  buscarPorUsuario(usuario) {
    return this.porUsuario.get(usuario) ?? null;
  }

  guardar(u) {
    this.insertar.run({
      usuario: u.usuario, nombre: u.nombre, rol: u.rol, sede: u.sede ?? null, tecnicoId: u.tecnicoId ?? null, correo: u.correo ?? null, hashClave: u.hashClave,
    });
  }

  eliminar(usuario) {
    return this.borrar.run(usuario).changes > 0;
  }

  listar() {
    return this.todos.all().map((u) => ({ ...u }));
  }
}

class RepositorioNotificacionesSqlite {
  constructor(db) {
    this.sql = {
      insertar: db.prepare(`INSERT INTO notificaciones (id, usuario, solicitud_id, tipo, titulo, mensaje, creada_en, leida)
                            VALUES (@id, @usuario, @solicitudId, @tipo, @titulo, @mensaje, @creadaEn, @leida)`),
      porUsuario: db.prepare(`SELECT id, usuario, solicitud_id AS solicitudId, tipo, titulo, mensaje, creada_en AS creadaEn, leida
                              FROM notificaciones WHERE usuario = ? ORDER BY creada_en DESC, rowid DESC LIMIT ?`),
      marcar: db.prepare('UPDATE notificaciones SET leida = 1 WHERE usuario = ? AND leida = 0'),
    };
  }

  guardar(n) {
    this.sql.insertar.run({
      id: n.id, usuario: n.usuario, solicitudId: n.solicitudId ?? null, tipo: n.tipo, titulo: n.titulo, mensaje: n.mensaje, creadaEn: n.creadaEn, leida: n.leida ? 1 : 0,
    });
  }

  listarPorUsuario(usuario, limite = 30) {
    return this.sql.porUsuario.all(usuario, limite).map((f) => ({ ...f, leida: f.leida === 1 }));
  }

  marcarLeidas(usuario) {
    return Number(this.sql.marcar.run(usuario).changes);
  }
}

/**
 * Transacción "todo o nada". Si ya hay una transacción abierta (un caso de uso
 * llamado dentro de otro) usa un SAVEPOINT, para que el anidamiento funcione.
 */
class UnidadDeTrabajoSqlite {
  constructor(db) {
    this.db = db;
    this.nivel = 0;
  }

  ejecutar(fn) {
    const punto = `sp_${this.nivel}`;
    this.db.exec(this.nivel === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${punto}`);
    this.nivel += 1;
    try {
      const resultado = fn();
      this.nivel -= 1;
      this.db.exec(this.nivel === 0 ? 'COMMIT' : `RELEASE ${punto}`);
      return resultado;
    } catch (error) {
      this.nivel -= 1;
      this.db.exec(this.nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${punto}; RELEASE ${punto}`);
      throw error;
    }
  }
}

module.exports = {
  RepositorioSolicitudesSqlite,
  RepositorioTecnicosSqlite,
  RepositorioEquiposSqlite,
  RepositorioUsuariosSqlite,
  RepositorioNotificacionesSqlite,
  UnidadDeTrabajoSqlite,
};
