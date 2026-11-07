const { GestionarUsuarios, LARGO_MINIMO_CLAVE } = require('../../../src/application/GestionarUsuarios');
const { DatoInvalido, NoEncontrado } = require('../../../src/domain/errores');

/** Repositorio de usuarios en memoria y credenciales falsas: la regla se prueba sin BD ni scrypt. */
class RepoUsuariosFake {
  constructor(usuarios = []) {
    this.datos = new Map(usuarios.map((u) => [u.usuario, { ...u }]));
  }

  buscarPorUsuario(u) { return this.datos.has(u) ? { ...this.datos.get(u) } : null; }

  guardar(u) { this.datos.set(u.usuario, { ...u }); }

  eliminar(u) { return this.datos.delete(u); }

  listar() { return [...this.datos.values()].map(({ hashClave: _h, ...u }) => u); }
}

const CLAVE = 'una-clave-larga';
function armar(usuarios = [{ usuario: 'admin', nombre: 'Coordinación', rol: 'ADMIN', hashClave: 'h:admin' }]) {
  const repoUsuarios = new RepoUsuariosFake(usuarios);
  const credenciales = { hashearClave: jest.fn((c) => `hash(${c})`) };
  const repoEquipos = { listar: () => [{ sede: 'CAMPUS' }, { sede: 'NORTE' }, { sede: 'CAMPUS' }] };
  return { caso: new GestionarUsuarios({ repoUsuarios, credenciales, repoEquipos }), repoUsuarios, credenciales };
}

describe('GestionarUsuarios', () => {
  describe('crear', () => {
    test('crea el primer coordinador real con la clave hasheada y sin devolver el hash', () => {
      // Arrange
      const { caso, repoUsuarios } = armar();
      // Act
      const creado = caso.crear({ usuario: '  Coordinacion ', nombre: 'Coordinación de soporte', rol: 'admin', clave: CLAVE });
      // Assert
      expect(creado).toEqual({ usuario: 'coordinacion', nombre: 'Coordinación de soporte', rol: 'ADMIN', sede: null, tecnicoId: null, correo: null });
      expect(repoUsuarios.buscarPorUsuario('coordinacion').hashClave).toBe(`hash(${CLAVE})`);
    });

    test('un docente queda en una sede registrada (en mayúsculas)', () => {
      const { caso } = armar();
      expect(caso.crear({ usuario: 'prof.ruiz', nombre: 'Prof. Ruiz', rol: 'DOCENTE', sede: 'norte', correo: ' ruiz@x.edu ', clave: CLAVE }))
        .toMatchObject({ rol: 'DOCENTE', sede: 'NORTE', correo: 'ruiz@x.edu' });
    });

    test.each([
      ['usuario repetido', { usuario: 'admin' }, /ya existe/],
      ['usuario con espacios', { usuario: 'juan perez' }, /3 a 40 caracteres/],
      ['usuario muy corto (2)', { usuario: 'ab' }, /3 a 40 caracteres/],
      ['sin nombre', { nombre: '  ' }, /nombre es obligatorio/],
      ['nombre de 81 caracteres', { nombre: 'x'.repeat(81) }, /nombre es obligatorio/],
      ['rol TECNICO (necesita registro de técnico)', { rol: 'TECNICO' }, /Rol inválido/],
      ['docente sin sede', { rol: 'DOCENTE', sede: undefined }, /necesitan una sede/],
      ['sede inexistente', { rol: 'ESTUDIANTE', sede: 'SUR' }, /Sede desconocida: SUR.*CAMPUS, NORTE/],
      [`clave de ${LARGO_MINIMO_CLAVE - 1} caracteres`, { clave: 'x'.repeat(LARGO_MINIMO_CLAVE - 1) }, /al menos 10/],
    ])('rechaza: %s', (_caso, cambio, mensaje) => {
      const { caso, credenciales } = armar();
      const datos = { usuario: 'nuevo', nombre: 'Nuevo', rol: 'ADMIN', clave: CLAVE, ...cambio };
      expect(() => caso.crear(datos)).toThrow(DatoInvalido);
      expect(() => caso.crear(datos)).toThrow(mensaje);
      expect(credenciales.hashearClave).not.toHaveBeenCalled();
    });

    test(`acepta una clave de exactamente ${LARGO_MINIMO_CLAVE} caracteres (valor límite)`, () => {
      const { caso } = armar();
      expect(() => caso.crear({ usuario: 'nuevo', nombre: 'Nuevo', rol: 'ADMIN', clave: 'x'.repeat(LARGO_MINIMO_CLAVE) })).not.toThrow();
    });
  });

  describe('cambiarClave', () => {
    test('reemplaza solo el hash y conserva el resto de la cuenta', () => {
      const { caso, repoUsuarios } = armar([{ usuario: 'laura', nombre: 'Laura', rol: 'TECNICO', sede: 'CAMPUS', tecnicoId: 'T-LAURA', hashClave: 'viejo' }]);
      caso.cambiarClave({ usuario: 'LAURA', clave: CLAVE });
      expect(repoUsuarios.buscarPorUsuario('laura')).toEqual({ usuario: 'laura', nombre: 'Laura', rol: 'TECNICO', sede: 'CAMPUS', tecnicoId: 'T-LAURA', hashClave: `hash(${CLAVE})` });
    });

    test('un usuario que no existe → NoEncontrado', () => {
      const { caso } = armar();
      expect(() => caso.cambiarClave({ usuario: 'nadie', clave: CLAVE })).toThrow(NoEncontrado);
    });
  });

  describe('eliminar', () => {
    test('retira una cuenta de demostración', () => {
      const { caso, repoUsuarios } = armar([
        { usuario: 'admin', rol: 'ADMIN' }, { usuario: 'estudiante', rol: 'ESTUDIANTE', sede: 'CAMPUS' },
      ]);
      expect(caso.eliminar({ usuario: 'estudiante' })).toEqual({ usuario: 'estudiante', eliminado: true });
      expect(repoUsuarios.buscarPorUsuario('estudiante')).toBeNull();
    });

    test('no deja el sistema sin coordinador: el último ADMIN no se elimina', () => {
      const { caso } = armar();
      expect(() => caso.eliminar({ usuario: 'admin' })).toThrow(/último coordinador/);
    });

    test('con otro ADMIN creado, la cuenta admin de demostración sí se elimina', () => {
      const { caso } = armar();
      caso.crear({ usuario: 'coordinacion', nombre: 'Coordinación', rol: 'ADMIN', clave: CLAVE });
      caso.eliminar({ usuario: 'admin' });
      expect(caso.listar().map((u) => u.usuario)).toEqual(['coordinacion']);
    });

    test('un técnico no se elimina (seguiría recibiendo solicitudes sin poder entrar)', () => {
      const { caso } = armar([{ usuario: 'admin', rol: 'ADMIN' }, { usuario: 'laura', rol: 'TECNICO' }]);
      expect(() => caso.eliminar({ usuario: 'laura' })).toThrow(/cambie su clave/);
    });

    test('un usuario que no existe → NoEncontrado', () => {
      const { caso } = armar();
      expect(() => caso.eliminar({ usuario: 'nadie' })).toThrow(NoEncontrado);
    });
  });
});
