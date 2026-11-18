import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { buildOpenApi } from './docs/openapi';
import { errorHandler, globalLimiter, notFound, sanitizeInput } from './middleware/common';
import adminRoutes from './modules/admin.routes';
import authRoutes from './modules/auth.routes';
import certificateRoutes from './modules/certificates.routes';
import donationRoutes from './modules/donations.routes';
import donorRoutes from './modules/donors.routes';
import { aiRouter, notificationsRouter, publicRouter, webhooksRouter } from './modules/misc.routes';
import { leaderboardRouter, pointsRouter } from './modules/points.routes';
import requirementRoutes from './modules/requirements.routes';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      // Log method/url/status only - never bodies, cookies or auth headers.
      serializers: {
        req: (r) => ({ method: r.method, url: String(r.url).split('?')[0], id: r.id }),
        res: (r) => ({ statusCode: r.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );

  // Swagger UI needs inline styles/scripts; scope the relaxed CSP to /api/docs only.
  app.use('/api/docs', helmet({ contentSecurityPolicy: false }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  app.use(
    cors({
      origin: (origin, cb) => {
        // Non-browser clients (no Origin header) and allow-listed origins only.
        if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.use(globalLimiter);
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);

  const v1 = express.Router();
  v1.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ success: dbUp, data: { status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down', uptime: Math.round(process.uptime()) } });
  });
  v1.use('/auth', authRoutes);
  v1.use('/donors', donorRoutes);
  v1.use('/donations', donationRoutes);
  v1.use('/certificates', certificateRoutes);
  v1.use('/requirements', requirementRoutes);
  v1.use('/points', pointsRouter);
  v1.use('/leaderboard', leaderboardRouter);
  v1.use('/notifications', notificationsRouter);
  v1.use('/admin', adminRoutes);
  v1.use('/ai', aiRouter);
  v1.use('/public', publicRouter);
  v1.use('/webhooks', webhooksRouter);
  app.use('/api/v1', v1);

  const spec = buildOpenApi('/api/v1');
  app.get('/api/docs.json', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'LifeDrop API' }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
