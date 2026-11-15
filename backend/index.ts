import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { createApp } from './src/app.js';
import { env } from './src/config/env.js';
import { noStore } from './src/lib/cache.js';
import { assertNoDemoAccounts } from './src/lib/demo-accounts.js';
import { errorHandler } from './src/lib/errors.middleware.js';
import {
  HEALTH_TIMEOUT_MS,
  sendHealth,
  withTimeout,
} from './src/lib/health.js';
import { logger } from './src/lib/logger.js';
import { connectDatabase } from './src/db/connection.js';

/**
 * Vercel serverless entrypoint.
 *
 * `src/server.ts` remains the long-process entry (local dev, tests, any host
 * that binds a port). This file is the serverless counterpart: no `listen`, no
 * `dotenv` — the platform injects env, and the Express app itself is the
 * request handler.
 *
 * The name and location are load-bearing. Vercel's Express preset looks for a
 * default export in `app`, `index` or `server` (at the root or under `src/`)
 * and picks the first one whose *source text* imports `express`. Do not reduce
 * this file to a re-export of another module: the detector reads the file, not
 * its import graph, and a re-export makes it fall through to `src/app.ts` —
 * the app factory, which is not an app. Keeping the real wrapper here means the
 * whole application ships as one function and Express sees every request path.
 *
 * The database cannot be opened at module load the way `src/server.ts` does: a
 * serverless instance may start, serve one request, and freeze, so a boot-time
 * connection would either be wasted or go stale. Instead the first request per
 * cold start waits for the connection, and the resolved promise is kept in
 * module scope so warm invocations skip straight through.
 */

/** Module scope survives across invocations on a warm instance. */
let connection: Promise<void> | undefined;

function ensureDatabase(): Promise<void> {
  connection ??= connectDatabase(env().MONGODB_URI)
    .then(() => assertNoDemoAccounts())
    .catch((error: unknown) => {
      // Drop the failed promise so the next request retries rather than
      // replaying a stale rejection for the life of the instance.
      connection = undefined;
      throw error;
    });
  return connection;
}

type ServerlessOptions = {
  connect?: () => Promise<void>;
  healthTimeoutMs?: number;
};

/**
 * A thin outer app rather than a change to `createApp`: middleware registered
 * after the inner app's routes would never run, so the connect hook wraps the
 * whole application instead. Errors from the hook — missing env, Atlas
 * unreachable — land in the same `errorHandler` envelope as everything else.
 *
 * Health is the exception: it is registered first, outside the connect hook, so
 * a database outage produces the documented 503 instead of a 500 (or a probe
 * timeout waiting for Mongoose's 10-second server selection). The health check
 * still *starts* the connection so a cold instance can warm up, but it bounds
 * how long it waits before reporting degraded.
 */
export function createServerlessApp({
  connect = ensureDatabase,
  healthTimeoutMs = HEALTH_TIMEOUT_MS,
}: ServerlessOptions = {}): Express {
  const server = express();
  server.disable('x-powered-by');
  server.use('/api', noStore);

  server.get('/api/health', async (req: Request, res: Response) => {
    try {
      await withTimeout(connect(), healthTimeoutMs);
    } catch (error: unknown) {
      // `sendHealth` reports the connection state; a failed or slow connect
      // must not turn a probe into a 500. Log it, though: a 503 without a
      // reason is indistinguishable from a platform outage.
      logger.warn({ err: error }, 'health probe connect did not complete');
    }
    sendHealth(req, res);
  });

  server.use(async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await connect();
      next();
    } catch (error: unknown) {
      next(error);
    }
  });

  server.use(createApp());
  // Catches errors from the connect gate above (and any wrapper-level errors).
  server.use(errorHandler);

  return server;
}

export default createServerlessApp();
