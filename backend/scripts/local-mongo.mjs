/**
 * Boots a MongoDB replica set and keeps it alive for local development.
 *
 * `npm run seed` and `npm run dev` need a database that outlives the command
 * that started it, which the in-process helper used by the tests cannot do.
 *
 * The dev instance binds a fixed port (27019 by default, override with
 * `MONGO_PORT`). A random port was the original design, but it left
 * `backend/.env` pointing at a dead port whenever the database was stopped or
 * started out of order, and the API then failed with `ECONNREFUSED`, which the
 * browser reports as "Cannot reach the server."
 *
 * If the fixed port is already taken, mongodb-memory-server falls back to a
 * free one. This script always rewrites `MONGODB_URI` in `backend/.env` with
 * the port actually in use, so the API follows whichever port won.
 *
 * Writes the URI to `.mongo-uri` so other processes can pick it up, then waits
 * for Ctrl-C. The database is in memory: stopping this process discards it and
 * `npm run seed` must be run again after the next start.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(backendDir, '.env');
const examplePath = join(backendDir, '.env.example');

const DEFAULT_PORT = 27019;
const requestedPort = Number(process.env.MONGO_PORT ?? DEFAULT_PORT);

if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 1 ||
  requestedPort > 65535
) {
  console.error(
    `[mongo] MONGO_PORT must be a TCP port between 1 and 65535, got "${process.env.MONGO_PORT}"`,
  );
  process.exit(1);
}

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  // Windows Defender can make the first mongod start exceed the library's 10s
  // default even after the binary is cached.
  instanceOpts: [{ port: requestedPort, launchTimeout: 120_000 }],
});
const uri = replSet.getUri('moka-pos');
const actualPort = replSet.servers[0]?.instanceInfo?.port;

// Keep the API and seed commands pointed at this run's port. Creating .env from
// the example on first run means a fresh checkout needs no manual copy step.
if (!existsSync(envPath)) copyFileSync(examplePath, envPath);

const env = readFileSync(envPath, 'utf8');
const line = `MONGODB_URI=${uri}`;
const updated = /^MONGODB_URI=.*$/m.test(env)
  ? env.replace(/^MONGODB_URI=.*$/m, line)
  : `${env.trimEnd()}\n${line}\n`;

writeFileSync(envPath, updated);

// Publish the readiness file only after `.env` names this URI. `smoke-ci` treats
// the file as the signal to seed, and seeding reads `.env` at process start.
writeFileSync(join(backendDir, '.mongo-uri'), uri);

console.log(`[mongo] ${uri}`);

if (actualPort !== requestedPort) {
  console.warn(
    `[mongo] port ${requestedPort} was already in use; using ${actualPort} instead`,
  );
}

console.log(
  `[mongo] listening on 127.0.0.1:${actualPort} — backend/.env updated`,
);
console.log('[mongo] press Ctrl-C to stop (in-memory data is discarded)');

const stop = async () => {
  console.log('[mongo] stopping; run `npm run seed` after the next start');
  await replSet.stop();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
