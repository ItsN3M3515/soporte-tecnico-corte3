const { DatoInvalido, NoEncontrado } = require('../domain/errores');
const { Rol } = require('../domain/modelo/enums');

const LARGO_MINIMO_CLAVE = 10;
const FORMATO_USUARIO = /^[a-z0-9._-]{3,40}$/;
// Los técnicos necesitan además su registro de técnico (sede, edificio base, teléfono), que se
// carga con los datos iniciales; por eso aquí solo se crean cuentas de estos roles.
const ROLES_CREABLES = [Rol.ADMIN, Rol.DOCENTE, Rol.ESTUDIANTE];

/**
 * Caso de uso: administrar las cuentas de acceso desde la consola del servidor
 * (crear el primer coordinador, cambiar una clave, retirar las cuentas de demostración).
 * Lo usa el adaptador de entrada de consola (src/adapters/in/cli/usuarios.js).
 */
class GestionarUsuarios {
  constructor({ repoUsuarios, credenciales, repoEquipos }) {
    this.repoUsuarios = repoUsuarios;
    this.credenciales = credenciales;
    this.repoEquipos = repoEquipos;
  }

  crear({ usuario, nombre, rol, sede, correo, clave }) {
    const id = normalizarUsuario(usuario);
    if (this.repoUsuarios.buscarPorUsuario(id)) {
      throw new DatoInvalido(`El usuario ${id} ya existe. Para cambiar su clave use el comando "clave".`);
    }
    const rolNormalizado = validarRol(rol);
    this.repoUsuarios.guardar({
      usuario: id,
      nombre: validarNombre(nombre),
      rol: rolNormalizado,
      sede: this.validarSede(sede, rolNormalizado),
      tecnicoId: null,
      correo: correo ? String(correo).trim() : null,
      hashClave: this.credenciales.hashearClave(validarClave(clave)),
    });
    return this.vista(id);
  }

  validarSede(sede, rol) {
    const normalizada = sede ? String(sede).toUpperCase().trim() : null;
    if (rol !== Rol.ADMIN && !normalizada) {
      throw new DatoInvalido('Docentes y estudiantes necesitan una sede (por ejemplo CAMPUS).');
    }
    const conocidas = this.sedesConocidas();
    if (normalizada && !conocidas.includes(normalizada)) {
      throw new DatoInvalido(`Sede desconocida: ${normalizada}. Sedes registradas: ${conocidas.join(', ')}.`);
    }
    return normalizada;
  }

  cambiarClave({ usuario, clave }) {
    const encontrado = this.buscar(usuario);
    this.repoUsuarios.guardar({ ...encontrado, hashClave: this.credenciales.hashearClave(validarClave(clave)) });
    return this.vista(encontrado.usuario);
  }

  eliminar({ usuario }) {
    const encontrado = this.buscar(usuario);
    if (encontrado.rol === Rol.TECNICO) {
      throw new DatoInvalido('Un técnico sigue recibiendo solicitudes aunque no tenga cuenta: cambie su clave en lugar de eliminarlo.');
    }
    if (encontrado.rol === Rol.ADMIN && this.repoUsuarios.listar().filter((u) => u.rol === Rol.ADMIN).length === 1) {
      throw new DatoInvalido('No se puede eliminar el último coordinador (ADMIN): cree otro antes.');
    }
    this.repoUsuarios.eliminar(encontrado.usuario);
    return { usuario: encontrado.usuario, eliminado: true };
  }

  listar() {
    return this.repoUsuarios.listar();
  }

  buscar(usuario) {
    const id = normalizarUsuario(usuario);
    const encontrado = this.repoUsuarios.buscarPorUsuario(id);
    if (!encontrado) throw new NoEncontrado(`El usuario ${id} no existe.`);
    return encontrado;
  }

  vista(usuario) {
    const { hashClave: _oculto, ...perfil } = this.repoUsuarios.buscarPorUsuario(usuario);
    return perfil;
  }

  sedesConocidas() {
    return [...new Set(this.repoEquipos.listar().map((e) => e.sede))].sort();
  }
}

function normalizarUsuario(usuario) {
  const id = String(usuario ?? '').toLowerCase().trim();
  if (!FORMATO_USUARIO.test(id)) {
    throw new DatoInvalido('El usuario debe tener de 3 a 40 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
  }
  return id;
}

function validarNombre(nombre) {
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 80) {
    throw new DatoInvalido('El nombre es obligatorio (máximo 80 caracteres).');
  }
  return nombre.trim();
}

function validarRol(rol) {
  const normalizado = String(rol || '').toUpperCase();
  if (!ROLES_CREABLES.includes(normalizado)) {
    throw new DatoInvalido(`Rol inválido: ${rol}. Use ${ROLES_CREABLES.join(', ')}.`);
  }
  return normalizado;
}

function validarClave(clave) {
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO_CLAVE) {
    throw new DatoInvalido(`La clave debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  }
  return clave;
}

module.exports = { GestionarUsuarios, LARGO_MINIMO_CLAVE };
