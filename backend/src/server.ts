import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';

/**
 * Process entrypoint: load env, connect the database, bind the port, and make
 * sure Ctrl-C does not leave a half-closed socket pool behind.
 */
async function main(): Promise<void> {
  const config = env();

  await connectDatabase(config.MONGODB_URI);
  console.log('[mongo] connected');

  const server = createServer(createApp());

  server.listen(config.PORT, () => {
    console.log(
      `[api] listening on http://localhost:${config.PORT} (${config.NODE_ENV})`,
    );
  });

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    console.log(`[api] ${signal} received, shutting down`);

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
  console.error('[api] failed to start', error);
  process.exit(1);
});
