import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import {
  connectDatabase,
  disconnectDatabase,
  redactMongoUri,
} from './db/connection.js';
import { assertNoDemoAccounts } from './lib/demo-accounts.js';
import { logger } from './lib/logger.js';

/**
 * Process entrypoint: load env, connect the database, bind the port, and make
 * sure Ctrl-C does not leave a half-closed socket pool behind.
 */
async function main(): Promise<void> {
  const config = env();

  // Log the target before connecting: when the API dies with ECONNREFUSED,
  // this line shows the exact host and port it tried. Credentials are stripped.
  logger.info(
    { mongo: redactMongoUri(config.MONGODB_URI) },
    '[mongo] connecting',
  );
  await connectDatabase(config.MONGODB_URI);
  logger.info('[mongo] connected');

  // A production process must not serve a single request while a seeded demo
  // password still works. The check needs the database, so it runs here.
  await assertNoDemoAccounts();

  const server = createServer(createApp());

  server.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
  });

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');

    server.close(() => {
      void disconnectDatabase().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });

    // Do not let a stuck keep-alive connection block the exit indefinitely.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'api failed to start');

  // The API binds the port only after the database connects, so an unreachable
  // database makes :3001 refuse connections. The frontend can only report that
  // as "Cannot reach the server", so point at the actual cause here.
  const reason =
    error instanceof Error ? `${error.name}: ${error.message}` : '';
  if (
    /MongooseServerSelectionError|ECONNREFUSED|Server selection timed out/i.test(
      reason,
    )
  ) {
    logger.error(
      'MongoDB is unreachable. Start the local database with `npm run mongo` (leave it running), then start the API again. If it just restarted, backend/.env now holds the new port.',
    );
  }

  process.exit(1);
});
