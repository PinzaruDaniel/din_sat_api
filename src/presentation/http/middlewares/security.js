import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';

export function csrfProtection({ allowedOrigin }) {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== allowedOrigin)
      throw new AppError(
        403,
        'INVALID_ORIGIN',
        'Originea cererii nu este permisă.',
      );
    const expected = req.session.csrfToken;
    const received = req.get('x-csrf-token');
    if (
      !expected ||
      !received ||
      Buffer.byteLength(expected) !== Buffer.byteLength(received) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(received))
    ) {
      throw new AppError(
        403,
        'CSRF_INVALID',
        'Sesiunea formularului a expirat. Reîncarcă pagina.',
      );
    }
    next();
  };
}
export function ensureCsrf(req) {
  req.session.csrfToken ??= randomBytes(32).toString('hex');
  return req.session.csrfToken;
}
export function requireUser(auth) {
  return async (req, _res, next) => {
    req.user = await auth.getUser(req.session.userId);
    next();
  };
}
export function requireRole(role) {
  return (req, _res, next) => {
    if (req.user.role !== role)
      throw new AppError(403, 'FORBIDDEN', 'Nu ai permisiunea necesară.');
    next();
  };
}
