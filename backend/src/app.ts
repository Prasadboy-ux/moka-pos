import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { corsOrigins } from './config/env.js';
import { errorHandler, notFoundHandler } from './lib/errors.middleware.js';
import { router as apiRouter } from './routes/index.js';

/**
 * The Express application, as a factory.
 *
 * `server.ts` owns the port and the database; this owns middleware and routes.
 * Tests import `createApp` and drive it with Supertest without binding a port
 * or opening a connection, which is why the two are separate files.
 *
 * Middleware order is load-bearing and reads top to bottom:
 *   helmet -> cors -> json -> cookies -> routes -> 404 -> error handler
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
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
