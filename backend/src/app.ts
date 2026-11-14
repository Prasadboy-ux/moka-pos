import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { corsOrigins, trustProxySetting } from './config/env.js';
import { noStore } from './lib/cache.js';
import { errorHandler, notFoundHandler } from './lib/errors.middleware.js';
import { sendHealth } from './lib/health.js';
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
 *   helmet -> cors -> compression -> request log -> no-store -> health -> json ->
 *   cookies -> rate limit -> routes -> 404 -> error handler
 *
 * Health is deliberately before the limiter and body parser: a probe must not
 * need the Mongo-backed counter store or a request body to answer.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Default false: only trust X-Forwarded-* when the deployment says a proxy
  // is actually in front. Otherwise a direct client could choose its own IP.
  app.set('trust proxy', trustProxySetting());

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
      genReqId: (req: Request, res: Response) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && incoming.trim().length > 0
            ? incoming.trim().slice(0, 200)
            : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
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
  // Session state and business data must never be cached by a shared browser.
  app.use('/api', noStore);
  // No body and no rate-limit counter: a probe must answer while Mongo and the
  // limiter's store are down. CORS and logging are already in place above.
  app.get('/api/health', sendHealth);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', apiLimiter());
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
