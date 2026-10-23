import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { errorHandler } from '../src/lib/errors.middleware.js';
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
  connection ??= connectDatabase(env().MONGODB_URI).catch((error: unknown) => {
    // Drop the failed promise so the next request retries rather than
    // replaying a stale rejection for the life of the instance.
    connection = undefined;
    throw error;
  });
  return connection;
}

/**
 * A thin outer app rather than a change to `createApp`: middleware registered
 * after the inner app's routes would never run, so the connect hook wraps the
 * whole application instead. Errors from the hook — missing env, Atlas
 * unreachable — land in the same `errorHandler` envelope as everything else.
 */
const server = express();

server.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await ensureDatabase();
    next();
  } catch (error: unknown) {
    next(error);
  }
});

server.use(createApp());
server.use(errorHandler);

export default server;
