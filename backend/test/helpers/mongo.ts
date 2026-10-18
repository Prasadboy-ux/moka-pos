import type { Express } from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { hashPassword } from '../../src/lib/password.js';
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

// --- Signed-in requests -----------------------------------------------------

export const TEST_PASSWORD = 'kasir123';

let adminHash = '';
let kasirHash = '';

/** scrypt is slow by design, and the hash of a fixed password is fixed. */
export async function prepareAccounts(): Promise<void> {
  adminHash ??= await hashPassword('admin123');
  kasirHash ??= await hashPassword(TEST_PASSWORD);
}

export type TestRole = 'admin' | 'kasir';

/**
 * Signs in over real HTTP and returns an agent carrying the session cookie.
 *
 * Hand-setting a cookie header would bypass the code under test. Going through
 * `POST /api/auth/login` means these tests exercise signing, cookie attributes
 * and verification exactly as a browser does.
 */
export async function agentFor(app: Express, role: TestRole = 'admin') {
  await prepareAccounts();

  const agent = request.agent(app);
  const credentials =
    role === 'admin'
      ? { username: 'admin', password: 'admin123' }
      : { username: 'kasir', password: TEST_PASSWORD };

  const response = await agent
    .post('/api/auth/login')
    .send(credentials)
    .expect(200);

  return {
    agent,
    user: response.body.user as { id: string; role: TestRole; name: string },
  };
}
