import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ALL_MODELS } from '../../src/models/index.js';

/**
 * A real MongoDB for tests, not a mock.
 *
 * A replica set rather than a standalone server is deliberate: `POST /api/orders`
 * runs inside a multi-document transaction, and a standalone mongod rejects
 * those. A mock that allowed them would let the one code path most likely to
 * corrupt data go untested.
 */

let replSet: MongoMemoryReplSet | undefined;

export async function startTestDatabase(): Promise<string> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);

  // `autoIndex` builds indexes in the background. Tests assert on them, so they
  // are built up front rather than raced against.
  await Promise.all(ALL_MODELS.map((model) => model.syncIndexes()));

  return uri;
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await replSet?.stop();
  replSet = undefined;
}

/** Wipe every collection while keeping indexes. */
export async function resetDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

/** Omit `passwordHash` unless asked — mirrors what a normal query returns. */
export async function createUser(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const { UserModel } = await import('../../src/models/user.model.js');
  return UserModel.create({
    name: 'Budi Santoso',
    username: 'admin',
    passwordHash: 'not-a-real-hash',
    role: 'admin',
    isActive: true,
    ...overrides,
  });
}
