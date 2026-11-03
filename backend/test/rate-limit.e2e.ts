import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { resetEnv } from '../src/config/env.js';
import { RateLimitModel } from '../src/lib/rate-limit-store.js';
import { ALL_MODELS } from '../src/models/index.js';
import {
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/mongo.js';

/**
 * The limiters are the one piece of defensive middleware no other suite can
 * see: every other e2e file runs with them skipped, so hundreds of requests
 * from one address cannot flake. This file opts in with
 * `RATE_LIMIT_TEST_ENABLED` and tiny windows, then asserts the two properties
 * they exist for:
 *
 *   - a client is refused with the documented 429 envelope once the window is
 *     exhausted;
 *   - the counter is shared across two separate app instances backed by the
 *     same Mongo — the property the per-process in-memory store could never
 *     give the serverless deployment, where every cold start resets counters.
 */

let appA: Express;
let appB: Express;

beforeAll(async () => {
  await startTestDatabase();

  // Set before any limiter is built: `loginLimiter()` reads env() the moment
  // its router is imported, so the app module is only pulled in here, after
  // the environment has been pinned and reset.
  process.env.RATE_LIMIT_TEST_ENABLED = 'true';
  process.env.RATE_LIMIT_LOGIN_MAX = '2';
  process.env.RATE_LIMIT_API_MAX = '10';
  resetEnv();

  const { createApp } = await import('../src/app.js');
  appA = createApp();
  appB = createApp();
}, 120_000);

afterAll(async () => {
  delete process.env.RATE_LIMIT_TEST_ENABLED;
  delete process.env.RATE_LIMIT_LOGIN_MAX;
  delete process.env.RATE_LIMIT_API_MAX;
  resetEnv();
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('login limiter', () => {
  const wrongPassword = { username: 'nobody', password: 'not-the-password' };

  function attempt(app: Express) {
    return request(app).post('/api/auth/login').send(wrongPassword);
  }

  it('refuses with the documented envelope once the window is exhausted', async () => {
    const first = await attempt(appA).expect(401);
    // Draft-8 answers a single combined header; one attempt against a limit
    // of two leaves r=1.
    expect(first.headers['ratelimit']).toContain('r=1');

    await attempt(appA).expect(401);

    const refused = await attempt(appA).expect(429);
    expect(refused.headers['retry-after']).toBeTruthy();
    expect(refused.body).toEqual({
      error: 'rate_limited',
      message: 'Too many sign-in attempts. Please wait and try again.',
    });
  });

  it('shares one counter across cold-started app instances', async () => {
    // Two isolates of the same deployment. Separate in-memory maps would allow
    // every second request through forever; the shared store lets exactly the
    // window's two attempts land before the refusals start.
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const app = i % 2 === 0 ? appA : appB;
      const response = await attempt(app);
      statuses.push(response.status);
    }

    expect(statuses.filter((status) => status === 401)).toHaveLength(2);
    expect(statuses.filter((status) => status === 429)).toHaveLength(3);
  });

  it('persists counters as Mongo documents namespaced per limiter', async () => {
    await attempt(appA).expect(401);
    await request(appA).get('/api/config').expect(200);

    // One document per limiter: the failed login spends both the per-IP and
    // the per-username budget, and the config probe lands in the API's. The
    // three namespaces never merge each other's windows.
    const rows = await RateLimitModel.find().lean();
    expect(rows).toHaveLength(3);
    const namespaced = rows.map((row) => String(row._id).split(':')[0]).sort();
    expect(namespaced).toEqual(['api', 'login', 'login-user']);

    const loginRow = rows.find((row) => String(row._id).startsWith('login:'));
    expect(loginRow?.hits).toBe(1);
    const usernameRow = rows.find((row) =>
      String(row._id).startsWith('login-user:'),
    );
    expect(usernameRow?.hits).toBe(1);
    expect(loginRow?.resetAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('api limiter', () => {
  it('refuses a runaway client beyond its window', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(appA).get('/api/config').expect(200);
    }

    const refused = await request(appA).get('/api/config').expect(429);
    expect(refused.headers['retry-after']).toBeTruthy();
    expect(refused.body.error).toBe('rate_limited');
    expect(refused.body.message).toBe(
      'Too many requests. Please wait a moment and try again.',
    );
  });

  it('does not spend the budget on health probes', async () => {
    // More than the API window, all bypassing the limiter. If health were
    // counted, the final config request would already be refused.
    for (let i = 0; i < 15; i += 1) {
      await request(appA).get('/api/health').expect(200);
    }

    await request(appA).get('/api/config').expect(200);
  });
});

describe('model registration', () => {
  it('registers the rate-limit model for test resets and index sync', () => {
    expect(ALL_MODELS).toContain(RateLimitModel);
  });
});
