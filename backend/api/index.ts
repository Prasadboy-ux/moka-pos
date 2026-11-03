import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { noStore } from '../src/lib/cache.js';
import { assertNoDemoAccounts } from '../src/lib/demo-accounts.js';
import { errorHandler } from '../src/lib/errors.middleware.js';
import {
  HEALTH_TIMEOUT_MS,
  sendHealth,
  withTimeout,
} from '../src/lib/health.js';
import { connectDatabase } from '../src/db/connection.js';

/**
 * Vercel serverless entrypoint.
 *
 * `server.ts` remains the long-process entry (local dev, tests, any host that
 * binds a port). This file is the serverless counterpart: no `listen`, no
 * `dotenv` — the platform injects env, and the Express app itself is the
 * request handler.
 *
 * The database cannot be opened at module load the way `server.ts` does: a
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
    } catch {
      // `sendHealth` reports the connection state; a failed or slow connect
      // must not turn a probe into a 500.
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
  server.use(errorHandler);

  return server;
}

export default createServerlessApp();
