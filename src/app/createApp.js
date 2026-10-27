import { createPickupRoutes } from '../presentation/features/pickup/pickupRoutes.js';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { createAuthRoutes } from '../presentation/features/auth/authRoutes.js';
import { createCatalogRoutes } from '../presentation/features/catalog/catalogRoutes.js';
import { createOrdersRoutes } from '../presentation/features/orders/ordersRoutes.js';
import {
  csrfProtection,
  requireUser,
} from '../presentation/http/middlewares/security.js';

export function createApp({ services, sessionStore, config }) {
  if (!config.sessionSecret || config.sessionSecret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  if (config.production && (!sessionStore || config.demo))
    throw new Error(
      'Production requires external persistence and a durable session store.',
    );
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    cors({
      origin: config.origin,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) =>
        res.status(429).json({
          code: 'RATE_LIMITED',
          message: 'Prea multe cereri. Încearcă din nou într-un minut.',
          requestId: req.requestId,
        }),
    }),
  );
  app.use(express.json({ limit: '20kb' }));
  const cookieOptions = {
    httpOnly: true,
    secure: config.production,
    sameSite: 'lax',
    path: '/',
  };
  app.use(
    session({
      name: 'dinsat.sid',
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 },
    }),
  );
  app.get('/api/v1/health', (_req, res) =>
    res.json({ status: 'ok', mode: config.demo ? 'demo' : 'connected' }),
  );
  app.use('/api/v1', csrfProtection({ allowedOrigin: config.origin }));
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: config.authLimit ?? 15,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Prea multe încercări. Revino în 15 minute.',
        requestId: req.requestId,
      }),
  });
  app.use(
    '/api/v1/auth',
    createAuthRoutes({ auth: services.auth, authLimiter, cookieOptions }),
  );
  const authenticated = requireUser(services.auth);
  app.use(
    '/api/v1',
    createCatalogRoutes({ catalog: services.catalog, authenticated }),
  );
  app.use(
    '/api/v1',
    createPickupRoutes({ pickup: services.pickup, authenticated }),
  );
  app.use(
    '/api/v1/orders',
    createOrdersRoutes({ orders: services.orders, authenticated }),
  );
  app.use((req, res) =>
    res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Resursa nu a fost găsită.',
      requestId: req.requestId,
    }),
  );
  app.use((error, req, res, _next) => {
    const status = error.status ?? 500;
    if (status >= 500)
      console.error({ requestId: req.requestId, message: error.message });
    res.status(status).json({
      code: error.code ?? (status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR'),
      message:
        status >= 500 ? 'A apărut o eroare. Încearcă din nou.' : error.message,
      fieldErrors: error.fieldErrors,
      requestId: req.requestId,
    });
  });
  return app;
}
