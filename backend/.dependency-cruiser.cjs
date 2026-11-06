/**
 * REGLAS DE ARQUITECTURA (funciones de aptitud) del estilo hexagonal, sacadas del ADR-001.
 * Corren en el pipeline (etapa "Reglas de arquitectura") con `npm run arquitectura`:
 * cualquier violación hace fallar el job y bloquea el pull request.
 *
 * Cada regla protege una frontera real del hexágono. Para comprobar que una regla
 * sí puede fallar, agregue en src/domain/modelo/Solicitud.js un
 * `require('../../adapters/out/persistence/sqlite/baseDatos')` y ejecute el comando.
 */
// Librerías de npm (se resuelven a node_modules/<paquete>/) y módulos de Node con E/S.
const INFRAESTRUCTURA =
  'node_modules/(express|socket\\.io|socket\\.io-client|jsonwebtoken|cors|qrcode)/' +
  '|^(node:)?(sqlite|http|https|net|fs|child_process)$';

module.exports = {
  forbidden: [
    {
      name: 'nucleo-sin-infraestructura',
      comment:
        'ADR-001, regla de dependencia: el dominio y los casos de uso no conocen adaptadores, ' +
        'la raíz de composición ni librerías de infraestructura. Solo hablan con el exterior por puertos.',
      severity: 'error',
      from: { path: '^src/(domain|application)/' },
      to: { path: '^src/(adapters|config)/' },
    },
    {
      name: 'nucleo-sin-librerias-de-infraestructura',
      comment: 'ADR-001: Express, Socket.IO, SQLite, JWT, CORS, QR, HTTP y archivos solo se usan en adaptadores.',
      severity: 'error',
      from: { path: '^src/(domain|application)/' },
      to: { path: INFRAESTRUCTURA },
    },
    {
      name: 'dominio-no-depende-de-aplicacion',
      comment: 'ADR-001: las reglas de negocio no conocen los casos de uso que las orquestan.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/application/' },
    },
    {
      name: 'entrada-no-usa-salida',
      comment:
        'ADR-001: los adaptadores de entrada (HTTP, Socket.IO, temporizador) llegan a la base de datos, ' +
        'al JWT o al publicador solo a través de los casos de uso. Equivale a «la presentación no ' +
        'accede directamente a la persistencia».',
      severity: 'error',
      from: { path: '^src/adapters/in/' },
      to: { path: '^src/adapters/out/' },
    },
    {
      name: 'salida-no-usa-entrada',
      comment: 'ADR-001: un adaptador de salida (SQLite, JWT, reloj) no depende de cómo entra la petición.',
      severity: 'error',
      from: { path: '^src/adapters/out/' },
      to: { path: '^src/adapters/in/' },
    },
    {
      name: 'solo-la-raiz-conecta-adaptadores',
      comment:
        'ADR-001: src/config es la raíz de composición, el único lugar (además de server.js) ' +
        'que crea adaptadores de salida y los conecta con los puertos.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(config/|server\\.js$|adapters/out/)' },
      to: { path: '^src/adapters/out/' },
    },
    {
      name: 'sin-ciclos',
      comment: 'Un ciclo entre módulos borra las fronteras: ya no se puede cambiar uno sin el otro.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(coverage|data)/' },
    moduleSystems: ['cjs'],
    reporterOptions: { text: { highlightFocused: true } },
  },
};
