/**
 * Boots a MongoDB replica set and keeps it alive for local development.
 *
 * `npm run seed` and `npm run dev` need a database that outlives the command
 * that started it, which the in-process helper used by the tests cannot do.
 *
 * Writes the URI to `.mongo-uri` so other processes can pick it up, then waits
 * for Ctrl-C.
 */
import { writeFileSync } from 'node:fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = replSet.getUri('moka-pos');

writeFileSync('.mongo-uri', uri);
console.log(`[mongo] ${uri}`);
console.log('[mongo] ready — press Ctrl-C to stop');

const stop = async () => {
  await replSet.stop();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);