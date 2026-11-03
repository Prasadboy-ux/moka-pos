import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { SESSION_COOKIE } from '../src/lib/session.js';
import { findByUsername, UserModel } from '../src/models/user.model.js';
import {
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/mongo.js';

/**
 * Auth against a real database, because the properties that matter here —
 * case-insensitive lookup, index-backed uniqueness, and a password hash that
 * only a real hash function produces — are all storage behaviour.
 */

const app: Express = createApp();

const PASSWORD = 'kasir-pass-2026';

/**
 * scrypt is deliberately slow — that is what makes it worth using — but hashing
 * three passwords in `beforeEach` across twenty tests dominated the suite's
 * runtime. The hash of a fixed password is fixed, so it is computed once.
 */
let adminHash = '';
let kasirHash = '';

beforeAll(async () => {
  await startTestDatabase();
  adminHash = await hashPassword('admin123');
  kasirHash = await hashPassword(PASSWORD);
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
  await createUser({
    name: 'Siti Rahayu',
    username: 'kasir',
    passwordHash: kasirHash,
    role: 'kasir',
    isActive: true,
  });
  await createUser({
    name: 'Andi Wijaya',
    username: 'kasir2',
    passwordHash: kasirHash,
    role: 'kasir',
    isActive: false,
  });
});

describe('POST /api/auth/login', () => {
  it('signs in and returns the user without any password field', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    expect(response.body.user).toEqual({
      id: expect.any(String),
      name: 'Budi Santoso',
      username: 'admin',
      role: 'admin',
      isActive: true,
    });
    expect(response.body.user).not.toHaveProperty('password');
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('scrypt$');
  });

  it('sets an httpOnly cookie the browser script cannot read', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
  });

  it('accepts a mixed-case username', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'KASIR', password: PASSWORD })
      .expect(200);
  });

  describe('the three refusals stay distinct', () => {
    it('unknown username is invalid', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nobody', password: 'whatever' })
        .expect(401);

      expect(response.body.error).toBe('unauthenticated');
    });

    it('wrong password is invalid, with the same message as an unknown user', async () => {
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ username: 'kasir', password: 'not-the-password' })
        .expect(401);

      const unknownUser = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nobody', password: 'not-the-password' })
        .expect(401);

      // Identical, so usernames cannot be enumerated from the response.
      expect(wrongPassword.body.error).toBe(unknownUser.body.error);
      expect(wrongPassword.body.message).toBe(unknownUser.body.message);
      expect(wrongPassword.body.reason).toBe('invalid');
      expect(unknownUser.body.reason).toBe('invalid');
    });

    it('deactivated account is reported as inactive, not invalid', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'kasir2', password: PASSWORD })
        .expect(401);

      expect(response.body.reason).toBe('inactive');
      expect(response.body.message).toMatch(/deactivated/i);
      expect(response.body.message).not.toBe(
        'That username and password do not match an account.',
      );
    });

    it('a role that contradicts the account is a 403 role mismatch', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'kasir', password: PASSWORD, role: 'admin' })
        .expect(403);

      expect(response.body.error).toBe('forbidden');
      expect(response.body.reason).toBe('role-mismatch');
      expect(response.body.message).toMatch(/kasir/i);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('a matching role is accepted', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'kasir', password: PASSWORD, role: 'kasir' })
        .expect(200);
    });

    /**
     * The right password must be required before deactivation is reported, or
     * the endpoint becomes an oracle for which accounts exist and are active.
     */
    it('will not reveal that an account is inactive without the right password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'kasir2', password: 'wrong' })
        .expect(401);

      expect(response.body.message).toBe(
        'That username and password do not match an account.',
      );
    });
  });

  describe('body validation', () => {
    it('rejects a missing username with field errors', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'admin123' })
        .expect(422);

      expect(response.body.error).toBe('validation');
      expect(response.body.fields).toHaveProperty('username');
    });

    it('rejects a blank password', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: '' })
        .expect(422);
    });

    it('rejects malformed JSON with the error envelope', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "admin"')
        .expect(422);

      expect(response.body.error).toBe('validation');
      expect(response.body.message).toMatch(/JSON/i);
    });
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(200);

    const response = await agent.get('/api/auth/me').expect(200);

    expect(response.body.user.username).toBe('kasir');
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('is 401 with no cookie', async () => {
    const response = await request(app).get('/api/auth/me').expect(401);

    expect(response.body.error).toBe('unauthenticated');
  });

  it('is 401 with a forged cookie', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=not-a-jwt`)
      .expect(401);
  });

  /**
   * The token is only an id. A session must stop working the moment the account
   * is deactivated, not twelve hours later when it happens to expire.
   */
  it('stops working as soon as the account is deactivated', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);

    await UserModel.updateOne(
      { username: 'kasir' },
      { $set: { isActive: false } },
    );

    const response = await agent.get('/api/auth/me').expect(401);
    expect(response.body.message).toMatch(/deactivated/i);
  });

  it('stops working if the account is deleted outright', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(200);

    await UserModel.deleteOne({ username: 'kasir' });

    await agent.get('/api/auth/me').expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 204 and clears the cookie', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(200);

    const response = await agent.post('/api/auth/logout').expect(204);

    expect(response.body).toEqual({});
    expect(response.headers['set-cookie']?.[0] ?? '').toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it('revokes the token server-side, not just in the browser', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(200);

    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE}=`);

    await agent.post('/api/auth/logout').expect(204);

    // Replay the captured cookie: clearing it locally is not enough.
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });
});

describe('POST /api/auth/change-password', () => {
  /** Signs kasir in and returns the agent holding the session. */
  async function kasirAgent() {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(200);
    return agent;
  }

  it('works for a cashier: 204, then the new password signs in', async () => {
    const agent = await kasirAgent();

    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-2026' })
      .expect(204);

    await request(app)
      .post('/api/auth/login')
      .send({ username: 'kasir', password: 'brand-new-2026' })
      .expect(200);

    const oldPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(401);
    expect(oldPassword.body.reason).toBe('invalid');
  });

  it('refuses a wrong current password with a field error', async () => {
    const agent = await kasirAgent();

    const response = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'not-the-password', newPassword: 'brand-new-2026' })
      .expect(422);

    expect(response.body.error).toBe('validation');
    expect(response.body.fields).toHaveProperty('currentPassword');

    // The password must not have changed as a side effect of the refusal.
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'kasir', password: PASSWORD })
      .expect(200);
  });

  it('refuses reusing the current password', async () => {
    const agent = await kasirAgent();

    const response = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
      .expect(422);

    expect(response.body.fields).toHaveProperty('newPassword');
  });

  it('requires a signed-in session', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'whatever123' })
      .expect(401);
  });

  it('enforces the same password floor as user creation', async () => {
    const agent = await kasirAgent();

    const short = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'abc' })
      .expect(422);
    expect(short.body.fields).toHaveProperty('newPassword');

    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-2026-yes' })
      .expect(204);
  });

  it('invalidates the session after the change', async () => {
    const agent = await kasirAgent();

    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-2026' })
      .expect(204);

    await agent.get('/api/auth/me').expect(401);
  });

  it('revokes sessions on other devices as well', async () => {
    const first = await kasirAgent();
    const second = await kasirAgent();

    await first
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-2026' })
      .expect(204);

    await first.get('/api/auth/me').expect(401);
    await second.get('/api/auth/me').expect(401);
  });

  it('stops working once the account is deactivated', async () => {
    const agent = await kasirAgent();

    await UserModel.updateOne(
      { username: 'kasir' },
      { $set: { isActive: false } },
    );

    const response = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-2026' })
      .expect(401);
    expect(response.body.message).toMatch(/deactivated|no longer valid/i);
  });
});

describe('password storage', () => {
  it('never stores the plaintext', async () => {
    const user = await findByUsername('kasir').select('+passwordHash');

    expect(user?.passwordHash).not.toBe(PASSWORD);
    expect(user?.passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');

    expect(a).not.toBe(b);
  });
});
