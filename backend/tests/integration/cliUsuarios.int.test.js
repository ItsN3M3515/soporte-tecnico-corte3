const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { crearContenedor } = require('../../src/config/contenedor');
const { sembrar } = require('../../src/config/datosIniciales');
const { crearApp } = require('../../src/adapters/in/http/app');

/**
 * Adaptador de consola (src/adapters/in/cli/usuarios.js) contra un archivo SQLite real, como se usa
 * en el servidor: `docker compose exec backend node src/adapters/in/cli/usuarios.js ...`.
 * Comprueba el paso de docs/implementacion.md "crear el primer usuario administrador".
 */
const CLI = path.join(__dirname, '..', '..', 'src', 'adapters', 'in', 'cli', 'usuarios.js');
const SECRETO = 'secreto-de-la-prueba-de-consola-123456';

describe('Consola de usuarios (adaptador de entrada CLI)', () => {
  let dir;
  let rutaBd;
  const correr = (args, entrada = '') => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args], {
    input: entrada, encoding: 'utf8', env: { ...process.env, DB_PATH: rutaBd, JWT_SECRET: SECRETO },
  });
  const login = (usuario, clave) => {
    const c = crearContenedor({ rutaBd, secretoJwt: SECRETO, log: { error() {}, info() {} } });
    return request(crearApp(c)).post('/api/auth/login').send({ usuario, clave }).then((r) => { c.db.close(); return r; });
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asistec-cli-'));
    rutaBd = path.join(dir, 'soporte.db');
    const c = crearContenedor({ rutaBd, secretoJwt: SECRETO, log: { error() {}, info() {} } });
    sembrar(c);
    c.db.close();
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('crear un coordinador con la clave por la entrada estándar: puede iniciar sesión por la API', async () => {
    const r = correr(['crear', '--usuario', 'coordinacion', '--nombre', 'Coordinación de soporte', '--rol', 'ADMIN'], 'clave-segura-2026\n');
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('Usuario creado: coordinacion (ADMIN)');
    const res = await login('coordinacion', 'clave-segura-2026');
    expect(res.status).toBe(200);
    expect(res.body.perfil.rol).toBe('ADMIN');
  });

  test('cambiar la clave de la cuenta de demostración admin: la clave conocida deja de servir', async () => {
    expect(correr(['clave', '--usuario', 'admin'], 'otra-clave-larga\n').status).toBe(0);
    expect((await login('admin', 'admin123')).status).toBe(403);
    expect((await login('admin', 'otra-clave-larga')).status).toBe(200);
  });

  test('retirar las cuentas de demostración después de crear el coordinador real', async () => {
    correr(['crear', '--usuario', 'coordinacion', '--nombre', 'Coordinación', '--rol', 'ADMIN'], 'clave-segura-2026\n');
    for (const u of ['admin', 'docente', 'docente.norte', 'estudiante']) expect(correr(['eliminar', '--usuario', u]).status).toBe(0);
    const lista = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'listar'], { encoding: 'utf8', env: { ...process.env, DB_PATH: rutaBd, JWT_SECRET: SECRETO } });
    expect(lista).toContain('coordinacion');
    expect(lista).not.toMatch(/'docente'|'estudiante'/);
    expect((await login('docente', 'docente123')).status).toBe(403);
  });

  test('errores: clave corta, comando desconocido y argumento sin valor terminan con código 1', () => {
    const corta = correr(['clave', '--usuario', 'admin'], 'corta\n');
    expect(corta.status).toBe(1);
    expect(corta.stderr).toContain('al menos 10 caracteres');
    expect(correr(['borrar-todo']).stderr).toContain('Comando desconocido');
    expect(correr(['eliminar', '--usuario']).stderr).toContain('Falta el valor de --usuario');
  });

  test('sin comando muestra la ayuda', () => {
    const r = correr([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Uso: node src/adapters/in/cli/usuarios.js');
  });
});
