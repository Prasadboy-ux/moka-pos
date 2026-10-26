import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from './config/env.js';
import { errorHandler, notFoundHandler } from './lib/errors.middleware.js';
import {
  logger,
  requestLogSerializer,
  responseLogSerializer,
} from './lib/logger.js';
import { apiLimiter } from './lib/rate-limit.js';
import { router as apiRouter } from './routes/index.js';

/**
 * The Express application, as a factory.
 *
 * `server.ts` owns the port and the database; this owns middleware and routes.
 * Tests import `createApp` and drive it with Supertest without binding a port
 * or opening a connection, which is why the two are separate files.
 *
 * Middleware order is load-bearing and reads top to bottom:
 *   helmet -> cors -> compression -> request log -> json -> cookies ->
 *   rate limit -> routes -> 404 -> error handler
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind a load balancer, so `secure` cookies and client IPs are read from
  // X-Forwarded-* rather than from the proxy's own connection.
  app.set('trust proxy', 1);

  app.use(helmet());
  // Before the body parser so an OPTIONS preflight short-circuits without
  // buffering a body it will never read.
  app.use(cors({ origin: corsOrigins(), credentials: true }));
  // Receipts, reports and CSV exports are the payloads worth shrinking; the
  // JSON command traffic is too small to care about.
  app.use(compression());
  app.use(
    pinoHttp({
      logger,
      // Keep cookies and authorization headers out of the log drain. Passing raw
      // serializers is deliberate: pino-http's default ones copy every header.
      wrapSerializers: false,
      serializers: {
        req: requestLogSerializer,
        res: responseLogSerializer,
        err: pino.stdSerializers.err,
      },
      // The health probe is polled by the platform every few seconds; logging
      // it would drown every line that matters.
      autoLogging: {
        ignore: (req) => req.url === '/api/health',
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', apiLimiter());
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
