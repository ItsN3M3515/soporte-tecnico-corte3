const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { AccesoDenegado } = require('../../../domain/errores');

/**
 * Adaptador del puerto ServicioCredenciales.
 *  - Claves: scrypt con sal aleatoria (formato "sal:hash").
 *  - Sesión: JWT firmado con expiración de 8 horas (una jornada de clases).
 */
class CredencialesJWT {
  constructor(secreto, { expiracion = '8h' } = {}) {
    if (!secreto) throw new Error('Falta el secreto JWT (variable JWT_SECRET).');
    this.secreto = secreto;
    this.expiracion = expiracion;
  }

  static hashear(clave) {
    const sal = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(clave, sal, 32).toString('hex');
    return `${sal}:${hash}`;
  }

  hashearClave(clave) {
    return CredencialesJWT.hashear(clave);
  }

  verificarClave(clave, guardado) {
    const [sal, hash] = String(guardado).split(':');
    if (!sal || !hash) return false;
    const calculado = crypto.scryptSync(String(clave), sal, 32);
    return crypto.timingSafeEqual(calculado, Buffer.from(hash, 'hex'));
  }

  emitirToken(perfil) {
    return jwt.sign(perfil, this.secreto, { expiresIn: this.expiracion });
  }

  leerToken(token) {
    try {
      const { iat: _iat, exp: _exp, ...perfil } = jwt.verify(token, this.secreto);
      return perfil;
    } catch {
      throw new AccesoDenegado('Sesión inválida o vencida.');
    }
  }
}

module.exports = { CredencialesJWT };
