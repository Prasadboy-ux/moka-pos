import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import server from '../index.js';
import { hashPassword } from '../src/lib/password.js';
import { SESSION_COOKIE } from '../src/lib/session.js';
import {
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/mongo.js';

/**
 * The serverless entry, `index.ts` at the project root.
 *
 * Every other suite drives `createApp` directly, which deliberately skips the
 * wrapper: the lazy database hook, the outer error handler, and the
 * pass-through of `/api/*` to the single Vercel function. A regression there —
 * middleware order, a swallowed error, a route the wrapper never forwards —
 * would only surface after a deploy, so the wrapper is held to the same
 * contract here.
 */

const PASSWORD = 'admin123';
let adminHash = '';

beforeAll(async () => {
  await startTestDatabase();
  adminHash = await hashPassword(PASSWORD);
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await createUser({
    name: 'Budi Santoso',
    username: 'admin',
    passwordHash: adminHash,
    role: 'admin',
    isActive: true,
  });
});

describe('serverless entry (index.ts)', () => {
  it('answers the health probe with db up, after the lazy connect hook', async () => {
    const response = await request(server).get('/api/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('signs in and sets the session cookie through the wrapper', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ username: 'admin', password: PASSWORD })
      .expect(200);

    expect(response.body.user).toEqual({
      id: expect.any(String),
      name: 'Budi Santoso',
      username: 'admin',
      role: 'admin',
      isActive: true,
      mfaEnabled: false,
    });

    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    // COOKIE_SECURE=false under test; production flips it behind TLS.
    expect(cookie).not.toContain('Secure');
  });

  it('serves nested paths through the Vercel entry point with the path intact', async () => {
    const agent = request.agent(server);
    await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: PASSWORD })
      .expect(200);

    const products = await agent.get('/api/products').expect(200);
    expect(Array.isArray(products.body)).toBe(true);
  });

  it('refuses a wrong password with the standard 401 envelope', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' })
      .expect(401);

    expect(response.body).toEqual({
      error: 'unauthenticated',
      reason: 'invalid',
      message: expect.any(String),
    });
  });

  it('turns a malformed JSON body into the validation envelope, not HTML', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not json')
      .expect(422);

    expect(response.body).toEqual({
      error: 'validation',
      message: 'The request body was not valid JSON.',
    });
  });

  it('answers an unknown route with the not-found envelope', async () => {
    const response = await request(server)
      .get('/api/no-such-route')
      .expect(404);

    expect(response.body).toEqual({
      error: 'not-found',
      message: expect.any(String),
    });
  });
});
