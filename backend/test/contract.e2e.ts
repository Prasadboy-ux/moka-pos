import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { runSeed } from '../src/seed.js';
import {
  agentFor,
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
  TEST_PASSWORD,
} from './helpers/mongo.js';

/**
 * The API surface itself, checked against the contract rather than against the
 * code that implements it.
 *
 * Most tests here describe what the service *should* have. That is deliberate:
 * a route table written by copying `routes/index.ts` would agree with itself and
 * tell us nothing. This list is transcribed from
 * frontend/docs/API-CONTRACT.md sections 2-9, so a missing route fails.
 */

const app: Express = createApp();

let admin: Awaited<ReturnType<typeof agentFor>>;
let kasir: Awaited<ReturnType<typeof agentFor>>;

/** Exactly the 41 product endpoints the contract lists. */
const CONTRACT_ROUTES = [
  'POST /api/auth/login',
  'POST /api/auth/mfa/verify',
  'POST /api/auth/mfa/setup-confirm',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password',

  'GET /api/config',

  'GET /api/categories',
  'POST /api/categories',
  'PUT /api/categories/order',
  'PUT /api/categories/:id',
  'DELETE /api/categories/:id',

  'GET /api/ingredients',
  'POST /api/ingredients',
  'GET /api/ingredients/:id',
  'PUT /api/ingredients/:id',

  'GET /api/products',
  'POST /api/products',
  'GET /api/products/:id',
  'PUT /api/products/:id',
  'PATCH /api/products/:id/active',
  'DELETE /api/products/:id',

  'GET /api/stock/movements',
  'POST /api/stock/adjust',
  'GET /api/stock/level',
  'GET /api/stock/value',

  'GET /api/orders',
  'POST /api/orders',
  'GET /api/orders/recent',
  'GET /api/orders/:id',
  'POST /api/orders/:id/void',

  'GET /api/reports/sales',

  'GET /api/users',
  'POST /api/users',
  'PUT /api/users/:id',
  'PATCH /api/users/:id/active',
  'POST /api/users/:id/mfa/reset',

  'GET /api/shifts/current',
  'GET /api/shifts',
  'POST /api/shifts',
  'POST /api/shifts/:id/close',
] as const;

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();

  // Created directly rather than through POST /api/users, which needs an admin
  // session, which is the very thing being set up here.
  await createUser({
    name: 'Budi Santoso',
    username: 'admin',
    passwordHash: await hashPassword('admin123'),
    role: 'admin',
  });
  await createUser({
    name: 'Siti Rahayu',
    username: 'kasir',
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: 'kasir',
  });

  admin = await agentFor(app, 'admin');
  kasir = await agentFor(app, 'kasir');
});

describe('the endpoint surface', () => {
  it('names all 41 contract endpoints, and no duplicates', () => {
    expect(CONTRACT_ROUTES).toHaveLength(41);
    expect(new Set(CONTRACT_ROUTES).size).toBe(41);
  });

  /**
   * Proves the route table matches. Express answers a wrong method with 404, and
   * an unreachable path with the same 404, so every route is probed with a
   * deliberately invalid id — a real one would need a fixture, and the point is
   * reachability, not behaviour.
   */
  it('answers every contract route with something other than "no such route"', async () => {
    const bogusId = 'not-an-id';

    for (const entry of CONTRACT_ROUTES) {
      const [method, template] = entry.split(' ');
      const path = template.replace(':id', bogusId);

      const response = await request(app)
        [method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](
          path,
        )
        .send({});

      // 404 here means the router has no such route. A validation 422, an
      // auth 401, or any other status means the route exists.
      expect(
        response.status,
        `${entry} answered ${response.status} ${JSON.stringify(response.body)}`,
      ).not.toBe(404);
    }
  });

  it('exposes public config before a session exists', async () => {
    const response = await request(app).get('/api/config').expect(200);

    expect(response.body).toEqual({
      taxRate: 0.1,
      storeTimezone: 'Asia/Jakarta',
    });
  });

  it('exposes a health probe that is not part of the product API', async () => {
    await request(app).get('/api/health').expect(200);
  });
});

describe('nothing beyond the contract', () => {
  const NOT_ALLOWED = [
    'DELETE /api/ingredients/:id',
    'GET /api/users/:id',
    'DELETE /api/users/:id',
    'DELETE /api/orders/:id',
    'PATCH /api/categories/:id',
    'POST /api/reports/sales',
    'GET /api/dashboard',
    'GET /api/inventory',
    'POST /api/transactions',
  ];

  it('has no routes the contract does not specify', async () => {
    for (const entry of NOT_ALLOWED) {
      const [method, template] = entry.split(' ');
      const path = template.replace(':id', '64b7f9c2e1a2b3c4d5e6f7a8');

      const response = await request(app)
        [method.toLowerCase() as 'delete' | 'get' | 'post' | 'patch'](path)
        .send({});

      expect(response.status, `${entry} should not exist`).toBe(404);
    }
  });

  /**
   * The old backend docs described `transactions` and `stock_history`. Those
   * were a superseded design; shipping them alongside the real contract would
   * give the frontend two half-matching APIs. (`GET /api/reports/sales` used to
   * be in that list too — the aggregation it needs has since been built, and it
   * is now CONTRACT_ROUTES entry 38.)
   */
  it('does not answer the superseded Express design', async () => {
    await request(app).get('/api/transactions').expect(404);
    await request(app).get('/api/stock_history').expect(404);
  });
});

describe('authentication covers the whole surface', () => {
  it('refuses every contract route without a session', async () => {
    // Login cannot require a session, and logout deliberately does not: it
    // clears the cookie, which is harmless when there is none, and demanding a
    // session would leave a stale cookie in place exactly when the client most
    // wants it gone. The two MFA completions carry short-lived challenge tokens
    // instead of a session; a malformed body is their 422, not a 401.
    const guarded = CONTRACT_ROUTES.filter(
      (entry) =>
        entry !== 'POST /api/auth/login' &&
        entry !== 'POST /api/auth/mfa/verify' &&
        entry !== 'POST /api/auth/mfa/setup-confirm' &&
        entry !== 'POST /api/auth/logout' &&
        entry !== 'GET /api/config',
    );

    for (const entry of guarded) {
      const [method, template] = entry.split(' ');
      const path = template.replace(':id', '64b7f9c2e1a2b3c4d5e6f7a8');

      const response = await request(app)
        [method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](
          path,
        )
        .send({});

      expect(
        response.status,
        `${entry} answered ${response.status} — it should require a session`,
      ).toBe(401);
    }
  });
});

describe('role gates match the frontend nav', () => {
  it('lets a cashier do what /dashboard/pos and /dashboard/transactions allow', async () => {
    await kasir.agent.get('/api/products').expect(200);
    await kasir.agent.get('/api/categories').expect(200);
    await kasir.agent.get('/api/orders').expect(200);
    await kasir.agent.get('/api/orders/recent').expect(200);
    await kasir.agent.get('/api/shifts/current').expect(200);
    await kasir.agent.post('/api/shifts').send({ openingFloat: 0 }).expect(201);
  });

  it('refuses a cashier what /dashboard/inventory, /products, /reports and /users gate', async () => {
    await kasir.agent.get('/api/ingredients').expect(200);
    await kasir.agent.get('/api/stock/movements').expect(403);
    await kasir.agent.get('/api/stock/value').expect(403);
    await kasir.agent.post('/api/categories').send({ name: 'X' }).expect(403);
    await kasir.agent.post('/api/products').send({}).expect(403);
    await kasir.agent.get('/api/users').expect(403);
  });

  it('lets an admin reach everything', async () => {
    await admin.agent.get('/api/stock/movements').expect(200);
    await admin.agent.get('/api/stock/value').expect(200);
    await admin.agent.get('/api/users').expect(200);
    await admin.agent.get('/api/orders').expect(200);
    await admin.agent.get('/api/products').expect(200);
    await admin.agent.get('/api/ingredients').expect(200);
    await admin.agent.get('/api/categories').expect(200);
  });
});

describe('the error envelope, uniformly', () => {
  it('uses the same shape for every failure mode', async () => {
    const attempts: { label: string; run: () => request.Test }[] = [
      { label: 'no session', run: () => request(app).get('/api/products') },
      {
        label: 'bad id',
        run: () => admin.agent.get('/api/products/not-an-id'),
      },
      {
        label: 'unknown id',
        run: () => admin.agent.get('/api/products/64b7f9c2e1a2b3c4d5e6f7a8'),
      },
      { label: 'wrong role', run: () => kasir.agent.get('/api/users') },
      {
        label: 'bad body',
        run: () => admin.agent.post('/api/categories').send({ name: '' }),
      },
      { label: 'unknown route', run: () => request(app).get('/api/nope') },
    ];

    for (const { label, run } of attempts) {
      const response = await run();

      expect(response.status, label).toBeGreaterThanOrEqual(400);
      expect(typeof response.body.error, label).toBe('string');
      expect(typeof response.body.message, label).toBe('string');
      // The frontend renders `message` directly, so it must be a sentence.
      expect(response.body.message.length, label).toBeGreaterThan(10);
      expect(response.body.message, label).toMatch(/[.!]$/);
      expect(response.body, label).not.toHaveProperty('stack');
    }
  });

  it('uses only the documented error codes', async () => {
    const allowed = new Set([
      'unauthenticated',
      'forbidden',
      'not-found',
      'validation',
      'conflict',
      'insufficient-stock',
      'internal',
      /**
       * `rate_limited` belongs to the vocabulary like any other code (the
       * frontend branches on `error`), but producing one here would make this
       * suite's spot checks attempt-dependent on the shared limiter. The full
       * protocol — envelope, retry headers, per-route scoping — is asserted in
       * rate-limit.e2e.
       */
    ]);

    const responses = [
      await request(app).get('/api/products'),
      await admin.agent.get('/api/products/not-an-id'),
      await admin.agent.get('/api/products/64b7f9c2e1a2b3c4d5e6f7a8'),
      await kasir.agent.get('/api/users'),
      await admin.agent.post('/api/categories').send({ name: '' }),
      await request(app).get('/api/nope'),
    ];

    for (const response of responses) {
      expect(allowed.has(response.body.error)).toBe(true);
    }
  });
});

describe('a full day of trading against seeded data', () => {
  it('answers every read the dashboard needs without a 500', async () => {
    await runSeed();

    const session = await agentFor(app, 'admin');
    // Each call is a thunk: supertest binds its server when a Test is constructed,
    // so collecting them into an array first loses that reference.
    const readings: [string, () => request.Test][] = [
      ['categories', () => session.agent.get('/api/categories')],
      ['ingredients', () => session.agent.get('/api/ingredients')],
      ['products', () => session.agent.get('/api/products')],
      [
        'inactive products',
        () => session.agent.get('/api/products?includeInactive=true'),
      ],
      ['orders', () => session.agent.get('/api/orders')],
      ['recent orders', () => session.agent.get('/api/orders/recent')],
      ['movements', () => session.agent.get('/api/stock/movements')],
      ['stock value', () => session.agent.get('/api/stock/value')],
      ['users', () => session.agent.get('/api/users')],
      ['shifts', () => session.agent.get('/api/shifts')],
      [
        'reports range',
        () => session.agent.get('/api/orders?from=2026-10-01&to=2026-10-17'),
      ],
    ];

    for (const [label, call] of readings) {
      const response = await call();
      expect(
        response.status,
        `${label} failed: ${JSON.stringify(response.body)}`,
      ).toBe(200);
    }
  });

  it('reports a stock value a shop could recognise', async () => {
    await runSeed();
    const session = await agentFor(app, 'admin');

    const response = await session.agent.get('/api/stock/value').expect(200);

    expect(response.body.ingredientsValue).toBeGreaterThan(0);
    expect(response.body.retailValue).toBeGreaterThan(0);
    expect(response.body.total).toBe(
      response.body.ingredientsValue + response.body.retailValue,
    );
  });
});

describe('hashes every password before it is stored', () => {
  it('never leaves the plaintext anywhere', async () => {
    await request(app)
      .post('/api/auth/logout')
      .catch(() => undefined);

    const { UserModel } = await import('../src/models/user.model.js');
    const { verifyPassword } = await import('../src/lib/password.js');

    const users = await UserModel.find().select('+passwordHash');
    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(user.passwordHash).not.toBe('admin123');
      expect(user.passwordHash).not.toBe('kasir123');
      expect(user.passwordHash).toMatch(/^(scrypt|argon2id)\$/);
      expect(
        (await verifyPassword('admin123', user.passwordHash)) ||
          (await verifyPassword('kasir123', user.passwordHash)),
      ).toBe(true);
    }
  });
});

describe('cors is credentialed and not wide open', () => {
  it('echoes an allowed origin and allows credentials', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:3000');

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow an arbitrary origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
