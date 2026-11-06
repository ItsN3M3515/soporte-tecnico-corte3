/** Backend REAL para las pruebas de navegador: puerto 3100 y una BD nueva en cada ejecución. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'asistec-e2e-'));
process.env.DB_PATH = path.join(carpeta, 'e2e.db');
process.env.PORT = '3100';
process.env.INTERVALO_ESCALACION_MS = '2000';
// Secreto aleatorio por ejecución: el servidor no arranca sin JWT_SECRET.
process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
require('../../backend/src/server.js');
