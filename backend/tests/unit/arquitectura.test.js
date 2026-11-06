const fs = require('node:fs');
const path = require('node:path');

/**
 * Prueba de ARQUITECTURA: verifica la regla de dependencia del estilo hexagonal.
 * El núcleo (domain + application) no puede importar adaptadores ni librerías
 * de infraestructura. Si alguien rompe la regla, esta prueba falla.
 */
const SRC = path.join(__dirname, '..', '..', 'src');
const PROHIBIDOS_EN_NUCLEO = ['express', 'socket.io', 'node:sqlite', 'jsonwebtoken', 'cors', 'qrcode', 'prom-client', '/adapters/', '/config/'];

function archivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    return e.isDirectory() ? archivosJs(ruta) : e.name.endsWith('.js') ? [ruta] : [];
  });
}

const importsDe = (archivo) => [...fs.readFileSync(archivo, 'utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);

describe('Regla de dependencia hexagonal', () => {
  test.each(['domain', 'application'])('src/%s no depende de infraestructura', (capa) => {
    const violaciones = archivosJs(path.join(SRC, capa)).flatMap((archivo) =>
      importsDe(archivo)
        .filter((imp) => PROHIBIDOS_EN_NUCLEO.some((p) => imp === p || imp.includes(p)))
        .map((imp) => `${path.relative(SRC, archivo)} → ${imp}`),
    );
    expect(violaciones).toEqual([]);
  });

  test('src/domain no depende de src/application', () => {
    const violaciones = archivosJs(path.join(SRC, 'domain')).filter((a) => importsDe(a).some((i) => i.includes('/application/')));
    expect(violaciones).toEqual([]);
  });
});
