import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { resetEnv } from '../src/config/env.js';
import { assertNoDemoAccounts } from '../src/lib/demo-accounts.js';
import { hashPassword } from '../src/lib/password.js';
import { UserModel } from '../src/models/user.model.js';
import {
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/mongo.js';

/**
 * The production demo-account guard is a startup check, so it gets its own
 * file: it flips NODE_ENV and must not leak that change into another suite.
 */

const ORIGINAL = {
  NODE_ENV: process.env.NODE_ENV,
  COOKIE_SECURE: process.env.COOKIE_SECURE,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
};

function restoreEnvironment(): void {
  const restore = (key: keyof typeof ORIGINAL): void => {
    const value = ORIGINAL[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  restore('NODE_ENV');
  restore('COOKIE_SECURE');
  restore('SESSION_SECRET');
  restore('CORS_ORIGIN');
  resetEnv();
}

function enterProduction(): void {
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SECURE = 'true';
  process.env.SESSION_SECRET =
    'production-test-secret-that-is-not-a-placeholder';
  delete process.env.CORS_ORIGIN;
  resetEnv();
}

beforeAll(async () => {
  await startTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  restoreEnvironment();
});

describe('production demo-account guard', () => {
  it('is a no-op outside production', async () => {
    await UserModel.create({
      name: 'Budi Santoso',
      username: 'admin',
      passwordHash: await hashPassword('admin123'),
      role: 'admin',
      isActive: true,
    });

    await expect(assertNoDemoAccounts()).resolves.toBeUndefined();
  });

  it('refuses to start while the seeded admin password still works', async () => {
    enterProduction();
    await UserModel.create({
      name: 'Budi Santoso',
      username: 'admin',
      passwordHash: await hashPassword('admin123'),
      role: 'admin',
      isActive: true,
    });

    await expect(assertNoDemoAccounts()).rejects.toThrow(
      /demo account\(s\) admin.*seeded password/i,
    );
  });

  it('refuses to start while the seeded cashier password still works', async () => {
    enterProduction();
    await UserModel.create({
      name: 'Siti Rahayu',
      username: 'kasir',
      passwordHash: await hashPassword('kasir123'),
      role: 'kasir',
      isActive: true,
    });

    await expect(assertNoDemoAccounts()).rejects.toThrow(/kasir/);
  });

  it('allows production once both seeded passwords are gone', async () => {
    enterProduction();
    await UserModel.create({
      name: 'Budi Santoso',
      username: 'admin',
      passwordHash: await hashPassword('admin-pass-2026'),
      role: 'admin',
      isActive: true,
    });

    await expect(assertNoDemoAccounts()).resolves.toBeUndefined();
  });

  it('allows a deactivated demo account', async () => {
    enterProduction();
    await UserModel.create({
      name: 'Andi Wijaya',
      username: 'kasir2',
      passwordHash: await hashPassword('kasir123'),
      role: 'kasir',
      isActive: false,
    });

    await expect(assertNoDemoAccounts()).resolves.toBeUndefined();
  });
});
