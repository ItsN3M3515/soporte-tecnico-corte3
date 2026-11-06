const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { crearContenedor } = require('./config/contenedor');
const { sembrar } = require('./config/datosIniciales');
const { crearApp } = require('./adapters/in/http/app');
const { crearServidorSockets } = require('./adapters/in/realtime/servidorSockets');
const { ProgramadorEscalacion } = require('./adapters/in/scheduler/ProgramadorEscalacion');

/** Punto de arranque: `npm start`. Variables en .env.example. */
const PUERTO = Number(process.env.PORT || 3000);
const rutaBd = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'soporte.db');
// La ruta la define quien despliega (variable DB_PATH), no un usuario de la API.
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (rutaBd !== ':memory:') fs.mkdirSync(path.dirname(rutaBd), { recursive: true });

// Sin valor por defecto: un secreto de desarrollo escrito en el código terminaría en producción.
if (!process.env.JWT_SECRET) {
  console.error('Falta la variable JWT_SECRET (ver .env.example). El servidor no arranca sin ella.');
  process.exit(1);
}

const contenedor = crearContenedor({
  rutaBd,
  secretoJwt: process.env.JWT_SECRET,
  minutosSinRespuesta: Number(process.env.MINUTOS_SIN_RESPUESTA || 5),
  minutosEnCola: Number(process.env.MINUTOS_EN_COLA || 10),
});
if (sembrar(contenedor)) console.log('Datos de demostración cargados.');

const servidor = http.createServer(crearApp(contenedor));
crearServidorSockets(servidor, contenedor);
new ProgramadorEscalacion(contenedor.escalarVencidas, {
  intervaloMs: Number(process.env.INTERVALO_ESCALACION_MS || 30000),
  activarProgramadas: contenedor.activarProgramadas,
}).iniciar();

servidor.listen(PUERTO, '0.0.0.0', () => {
  console.log(`API de soporte técnico en http://localhost:${PUERTO}/api`);
});
