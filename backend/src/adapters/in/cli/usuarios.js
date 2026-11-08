#!/usr/bin/env node
/**
 * Adaptador de ENTRADA de consola: administra las cuentas de acceso sobre la misma base de datos
 * que usa el servidor. Solo traduce argumentos ↔ caso de uso GestionarUsuarios.
 *
 * Dentro del contenedor (DB_PATH y JWT_SECRET ya están definidas):
 *   docker compose exec backend node src/adapters/in/cli/usuarios.js listar
 *   docker compose exec backend node src/adapters/in/cli/usuarios.js crear --usuario coordinacion \
 *       --nombre "Coordinación de soporte" --rol ADMIN [--correo soporte@ejemplo.edu.co]
 *   docker compose exec backend node src/adapters/in/cli/usuarios.js clave --usuario docente
 *   docker compose exec backend node src/adapters/in/cli/usuarios.js eliminar --usuario estudiante
 *
 * La clave nunca va en los argumentos (quedaría en el historial de la consola y en la lista de
 * procesos): se escribe cuando el comando la pide, o se pasa por la entrada estándar con -T:
 *   printf '%s\n' "$CLAVE" | docker compose exec -T backend node src/adapters/in/cli/usuarios.js clave --usuario admin
 */
const crypto = require('node:crypto');
const path = require('node:path');
const readline = require('node:readline');
const { crearContenedor } = require('../../../config/contenedor');

const AYUDA = `Uso: node src/adapters/in/cli/usuarios.js <comando> [opciones]
  listar
  crear    --usuario <id> --nombre "<nombre>" --rol <ADMIN|DOCENTE|ESTUDIANTE> [--sede <SEDE>] [--correo <correo>]
  clave    --usuario <id>
  eliminar --usuario <id>
La clave se pide por la consola (o se lee de la entrada estándar).`;

function leerOpciones(args) {
  const opciones = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const [actual, valor] = [args.at(i), args.at(i + 1)];
    if (!actual.startsWith('--')) throw new Error(`Argumento inesperado: ${actual}`);
    if (valor === undefined || valor.startsWith('--')) throw new Error(`Falta el valor de ${actual}`);
    opciones.set(actual.slice(2), valor);
  }
  return Object.fromEntries(opciones);
}

/** Cada comando: qué hace con el caso de uso y qué imprime. */
const COMANDOS = new Map([
  ['listar', async (caso) => console.table(caso.listar())],
  ['crear', async (caso, opciones) => {
    const creado = caso.crear({ ...opciones, clave: await leerClave() });
    console.log(`Usuario creado: ${creado.usuario} (${creado.rol}${creado.sede ? `, sede ${creado.sede}` : ''})`);
  }],
  ['clave', async (caso, { usuario }) => {
    const actualizado = caso.cambiarClave({ usuario, clave: await leerClave() });
    console.log(`Clave cambiada: ${actualizado.usuario}`);
  }],
  ['eliminar', async (caso, { usuario }) => {
    const { usuario: eliminado } = caso.eliminar({ usuario });
    console.log(`Usuario eliminado: ${eliminado}`);
  }],
]);

/** Lee la clave: la pide dos veces si hay una terminal; si no, toma la primera línea de la entrada estándar. */
async function leerClave() {
  if (!process.stdin.isTTY) {
    const lineas = readline.createInterface({ input: process.stdin });
    for await (const linea of lineas) return linea;
    return '';
  }
  // Una sola interfaz para las dos preguntas: con dos, la primera se queda con lo ya escrito.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let mostrar = true;
  rl._writeToOutput = (texto) => { if (mostrar) process.stdout.write(texto); }; // no muestra la clave
  // Las líneas que llegan juntas (por ejemplo, pegadas) se guardan en orden hasta que se pidan.
  const pendientes = [];
  const esperando = [];
  rl.on('line', (linea) => (esperando.length ? esperando.shift()(linea) : pendientes.push(linea)));
  const preguntar = (texto) => {
    mostrar = true;
    rl.setPrompt(texto);
    rl.prompt();
    mostrar = false;
    return new Promise((resolver) => {
      const responder = (linea) => { process.stdout.write('\n'); resolver(linea); };
      if (pendientes.length) responder(pendientes.shift());
      else esperando.push(responder);
    });
  };
  try {
    const primera = await preguntar('Clave nueva: ');
    const segunda = await preguntar('Repita la clave: ');
    if (primera !== segunda) throw new Error('Las claves no coinciden.');
    return primera;
  } finally {
    rl.close();
  }
}

async function principal(argv) {
  const [comando, ...resto] = argv;
  if (!comando || comando === 'ayuda' || comando === '--help') {
    console.log(AYUDA);
    return 0;
  }
  if (!COMANDOS.has(comando)) throw new Error(`Comando desconocido: ${comando}\n${AYUDA}`);
  const opciones = leerOpciones(resto);
  const rutaBd = process.env.DB_PATH || path.join(__dirname, '..', '..', '..', '..', 'data', 'soporte.db');
  // Administrar cuentas no firma tokens; si JWT_SECRET falta (fuera del contenedor), basta uno aleatorio de un solo uso.
  const secretoJwt = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  const contenedor = crearContenedor({ rutaBd, secretoJwt, log: { error() {}, info() {} } });
  try {
    await COMANDOS.get(comando)(contenedor.gestionarUsuarios, opciones);
    return 0;
  } finally {
    contenedor.db.close();
  }
}

if (require.main === module) {
  principal(process.argv.slice(2))
    .then((codigo) => { process.exitCode = codigo; })
    .catch((e) => { console.error(`Error: ${e.message}`); process.exitCode = 1; });
}

module.exports = { principal, leerOpciones };
