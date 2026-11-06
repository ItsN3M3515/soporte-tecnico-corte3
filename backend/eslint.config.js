/**
 * ESCANEO DE CÓDIGO (análisis estático).
 *  - @eslint/js "recommended": errores comunes (variables sin usar, código inalcanzable, etc.)
 *  - eslint-plugin-security: patrones inseguros (regex vulnerables a ReDoS, eval,
 *    rutas de archivo construidas con datos externos, etc.)
 *  - eslint-plugin-jest: malas prácticas en pruebas (tests sin expect, tests duplicados)
 *  - Reglas propias: complejidad ciclomática máxima 10 por función y la REGLA DE
 *    DEPENDENCIA de la arquitectura hexagonal (el núcleo no puede importar adaptadores).
 *
 * Uso: npm run lint        (falla si hay errores)
 *      npm run lint:reporte (genera ../docs/evidencias/escaneo-codigo.html)
 */
const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');
const jest = require('eslint-plugin-jest');

const PROHIBIDOS_EN_NUCLEO = {
  patterns: [
    { group: ['**/adapters/**', '**/config/**'], message: 'Regla hexagonal: el núcleo no puede depender de adaptadores ni de la configuración.' },
  ],
  paths: ['express', 'socket.io', 'node:sqlite', 'jsonwebtoken', 'cors', 'qrcode', 'prom-client'].map((name) => ({
    name,
    message: 'Regla hexagonal: el núcleo no puede usar librerías de infraestructura. Use un puerto.',
  })),
};

module.exports = [
  { ignores: ['coverage/**', 'node_modules/**', 'data/**'] },
  js.configs.recommended,
  security.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/domain/**/*.js', 'src/application/**/*.js'],
    rules: { 'no-restricted-imports': ['error', PROHIBIDOS_EN_NUCLEO] },
  },
  {
    files: ['tests/**/*.js'],
    ...jest.configs['flat/recommended'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      // En las pruebas los accesos por clave dinámica y los archivos temporales son intencionales.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
];
