import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { ShiftModel } from '../src/models/shift.model.js';
import {
  agentFor,
  createUser,
  findByUsername,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
  TEST_PASSWORD,
} from './helpers/mongo.js';

/** Accounts and cash shifts. Both admin-gated except shifts, which cashiers use. */

const app: Express = createApp();

let admin: Awaited<ReturnType<typeof agentFor>>;
let kasir: Awaited<ReturnType<typeof agentFor>>;

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();

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

describe('GET /api/users', () => {
  it('is admin-only', async () => {
    await kasir.agent.get('/api/users').expect(403);
    await request(app).get('/api/users').expect(401);
  });

  it('lists by name, never with a password field', async () => {
    const response = await admin.agent.get('/api/users').expect(200);

    expect(response.body.map((u: { name: string }) => u.name)).toEqual([
      'Budi Santoso',
      'Siti Rahayu',
    ]);
    for (const user of response.body) {
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('passwordHash');
    }
  });
});

describe('POST /api/users', () => {
  it('creates an account with a hashed password', async () => {
    const response = await admin.agent
      .post('/api/users')
      .send({
        name: 'Andi Wijaya',
        username: 'kasir2',
        password: 'kasir123',
        role: 'kasir',
        isActive: true,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Andi Wijaya',
      username: 'kasir2',
      role: 'kasir',
    });

    const stored = await findByUsername('kasir2').select('+passwordHash');
    expect(stored?.passwordHash).not.toBe('kasir123');
    expect(stored?.passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('refuses a username that differs only in case', async () => {
    const response = await admin.agent
      .post('/api/users')
      .send({
        name: 'Impostor',
        username: 'ADMIN',
        password: 'secret123',
        role: 'admin',
        isActive: true,
      })
      .expect(409);

    expect(response.body.error).toBe('conflict');
    expect(response.body.reason).toBe('username-taken');
  });

  it('requires a password on create', async () => {
    await admin.agent
      .post('/api/users')
      .send({
        name: 'No Password',
        username: 'nopass',
        role: 'kasir',
        isActive: true,
      })
      .expect(422);
  });

  it('rejects a password under six characters', async () => {
    await admin.agent
      .post('/api/users')
      .send({
        name: 'Short',
        username: 'shorty',
        password: 'abc',
        role: 'kasir',
        isActive: true,
      })
      .expect(422);
  });

  it('rejects a username with unusual characters', async () => {
    await admin.agent
      .post('/api/users')
      .send({
        name: 'Odd Name',
        username: 'bad name!',
        password: 'secret123',
        role: 'kasir',
        isActive: true,
      })
      .expect(422);
  });
});

describe('PUT /api/users/:id', () => {
  let targetId = '';

  beforeEach(async () => {
    const created = await admin.agent
      .post('/api/users')
      .send({
        name: 'Andi Wijaya',
        username: 'kasir2',
        password: 'kasir123',
        role: 'kasir',
        isActive: true,
      })
      .expect(201);
    targetId = created.body.id;
  });

  it('leaves the password alone when none is sent', async () => {
    const before = await findByUsername('kasir2').select('+passwordHash');

    await admin.agent
      .put(`/api/users/${targetId}`)
      .send({
        name: 'Andi W',
        username: 'kasir2',
        role: 'kasir',
        isActive: true,
      })
      .expect(200);

    const after = await findByUsername('kasir2').select('+passwordHash');
    expect(after?.passwordHash).toBe(before?.passwordHash);
  });

  it('changes the password when one is sent', async () => {
    const before = await findByUsername('kasir2').select('+passwordHash');

    await admin.agent
      .put(`/api/users/${targetId}`)
      .send({
        name: 'Andi W',
        username: 'kasir2',
        role: 'kasir',
        isActive: true,
        password: 'newpass123',
      })
      .expect(200);

    const after = await findByUsername('kasir2').select('+passwordHash');
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
  });

  it('lets a user keep their own username on save', async () => {
    await admin.agent
      .put(`/api/users/${targetId}`)
      .send({
        name: 'Andi Wijaya',
        username: 'kasir2',
        role: 'kasir',
        isActive: false,
      })
      .expect(200);
  });

  it('refuses to take another account’s username', async () => {
    const response = await admin.agent
      .put(`/api/users/${targetId}`)
      .send({ name: 'Andi', username: 'kasir', role: 'kasir', isActive: true })
      .expect(409);

    expect(response.body.reason).toBe('username-taken');
  });

  it('refuses to demote the last active admin', async () => {
    const response = await admin.agent
      .put(`/api/users/${admin.user.id}`)
      .send({
        name: 'Budi Santoso',
        username: 'admin',
        role: 'kasir',
        isActive: true,
      })
      .expect(409);

    expect(response.body.reason).toBe('last-active-admin');
    expect(response.body.message).toMatch(/last active admin/i);
  });
});

describe('PATCH /api/users/:id/active', () => {
  it('deactivates a cashier', async () => {
    const response = await admin.agent
      .patch(`/api/users/${kasir.user.id}/active`)
      .send({ isActive: false })
      .expect(200);

    expect(response.body.isActive).toBe(false);
  });

  /**
   * Without this the shop can be left with no account that can reach user
   * management, and the only way back is editing the database by hand.
   */
  it('refuses to deactivate the last active admin', async () => {
    const response = await admin.agent
      .patch(`/api/users/${admin.user.id}/active`)
      .send({ isActive: false })
      .expect(409);

    expect(response.body.reason).toBe('last-active-admin');
    expect((await findByUsername('admin'))?.isActive).toBe(true);
  });

  it('allows deactivating an admin once another one exists', async () => {
    const second = await admin.agent
      .post('/api/users')
      .send({
        name: 'Second Admin',
        username: 'admin2',
        password: 'secret123',
        role: 'admin',
        isActive: true,
      })
      .expect(201);

    await admin.agent
      .patch(`/api/users/${second.body.id}/active`)
      .send({ isActive: false })
      .expect(200);

    // Demoting the promoted account is now allowed too.
    await admin.agent
      .patch(`/api/users/${second.body.id}/active`)
      .send({ isActive: true })
      .expect(200);

    await admin.agent
      .put(`/api/users/${second.body.id}`)
      .send({
        name: 'Second Admin',
        username: 'admin2',
        role: 'kasir',
        isActive: true,
      })
      .expect(200);
  });

  it('has no delete route, because orders reference the cashier', async () => {
    await admin.agent.delete(`/api/users/${kasir.user.id}`).expect(404);
  });
});

describe('shifts', () => {
  it('is open to a cashier, who opens their own', async () => {
    const opened = await kasir.agent
      .post('/api/shifts')
      .send({ openingFloat: 500000 })
      .expect(201);

    expect(opened.body.status).toBe('open');
    expect(opened.body.openingFloat).toBe(500000);
    expect(opened.body.userName).toBe('Siti Rahayu');
  });

  it('returns null, not a 404, when there is no open shift', async () => {
    const response = await kasir.agent.get('/api/shifts/current').expect(200);
    expect(response.body).toBeNull();
  });

  it('refuses a second open shift', async () => {
    await kasir.agent
      .post('/api/shifts')
      .send({ openingFloat: 500000 })
      .expect(201);

    const response = await kasir.agent
      .post('/api/shifts')
      .send({ openingFloat: 500000 })
      .expect(409);

    expect(response.body.reason).toBe('already-open-shift');
  });

  it('takes the cashier from the session, ignoring one in the body', async () => {
    const opened = await kasir.agent
      .post('/api/shifts')
      .send({
        openingFloat: 500000,
        cashier: { id: admin.user.id, name: 'Budi Santoso' },
      })
      .expect(201);

    expect(opened.body.userId).toBe(kasir.user.id);
  });

  it('closes with a counted float', async () => {
    const opened = await kasir.agent
      .post('/api/shifts')
      .send({ openingFloat: 500000 })
      .expect(201);

    const closed = await kasir.agent
      .post(`/api/shifts/${opened.body.id}/close`)
      .send({ counted: 1200000 })
      .expect(200);

    expect(closed.body.status).toBe('closed');
    expect(closed.body.closingCounted).toBe(1200000);
    expect(closed.body.closedAt).toBeTruthy();
  });

  it('refuses a double close', async () => {
    const opened = await kasir.agent
      .post('/api/shifts')
      .send({ openingFloat: 500000 })
      .expect(201);
    await kasir.agent
      .post(`/api/shifts/${opened.body.id}/close`)
      .send({ counted: 1 })
      .expect(200);

    const response = await kasir.agent
      .post(`/api/shifts/${opened.body.id}/close`)
      .send({ counted: 2 })
      .expect(409);

    expect(response.body.reason).toBe('already-closed-shift');
  });

  it('lists newest first and filters by cashier', async () => {
    const mine = await kasir.agent
      .post('/api/shifts')
      .send({ openingFloat: 100 })
      .expect(201);
    await kasir.agent
      .post(`/api/shifts/${mine.body.id}/close`)
      .send({ counted: 200 })
      .expect(200);

    await admin.agent
      .post('/api/shifts')
      .send({ openingFloat: 50 })
      .expect(201);

    const all = await kasir.agent.get('/api/shifts').expect(200);
    const justMine = await kasir.agent
      .get(`/api/shifts?cashierId=${kasir.user.id}`)
      .expect(200);

    expect(all.body).toHaveLength(2);
    expect(justMine.body).toHaveLength(1);
    expect(await ShiftModel.countDocuments({ status: 'open' })).toBe(1);
  });

  it('requires a session', async () => {
    await request(app).get('/api/shifts/current').expect(401);
  });
});
