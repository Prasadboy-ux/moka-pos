import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetEnv } from '../src/config/env.js';
import { encryptSecret } from '../src/lib/encryption.js';
import { hashPassword } from '../src/lib/password.js';
import { SESSION_COOKIE } from '../src/lib/session.js';
import {
  computeTotpCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
} from '../src/lib/totp.js';
import { UserModel } from '../src/models/user.model.js';
import {
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/mongo.js';

/**
 * Real HTTP coverage for the MFA routes. The regular auth suite runs with
 * admin MFA off, so without this file enrolment, challenge verification,
 * backup-code consumption and the administrative reset would have no
 * end-to-end coverage.
 */

const previousMfaFlag = process.env.MFA_ENFORCE_ADMIN;
process.env.MFA_ENFORCE_ADMIN = 'true';
resetEnv();

const app: Express = createApp();

let adminHash = '';
let kasirHash = '';

beforeAll(async () => {
  await startTestDatabase();
  adminHash = await hashPassword('admin123');
  kasirHash = await hashPassword('unused');
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
  if (previousMfaFlag === undefined) delete process.env.MFA_ENFORCE_ADMIN;
  else process.env.MFA_ENFORCE_ADMIN = previousMfaFlag;
  resetEnv();
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
});

async function enroll(username: string) {
  const secret = generateTotpSecret();
  const backupCodes = generateBackupCodes(8);
  await UserModel.updateOne(
    { username },
    {
      $set: {
        mfaEnabled: true,
        mfaSecret: encryptSecret(secret),
        mfaBackupCodes: backupCodes.map(hashBackupCode),
      },
    },
  );
  return { secret, backupCodes };
}

async function challenge(username: string, password = 'admin123') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);

  expect(response.body.mfaRequired).toBe(true);
  return response.body.mfaToken as string;
}

describe('admin MFA enrolment', () => {
  it('enrols, returns recovery codes, then accepts a TOTP challenge', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    expect(login.body.mfaSetupRequired).toBe(true);
    expect(login.body.username).toBe('admin');
    expect(login.headers['set-cookie']).toBeUndefined();

    const { setupToken, secret } = login.body as {
      setupToken: string;
      secret: string;
    };

    const confirm = await agent
      .post('/api/auth/mfa/setup-confirm')
      .send({ setupToken, code: computeTotpCode(secret) })
      .expect(200);

    expect(confirm.body.backupCodes).toHaveLength(8);
    expect(confirm.headers['set-cookie']?.[0] ?? '').toContain(
      `${SESSION_COOKIE}=`,
    );

    const stored = await UserModel.findOne({ username: 'admin' }).select(
      '+mfaSecret +mfaBackupCodes',
    );
    expect(stored?.mfaEnabled).toBe(true);
    expect(stored?.mfaSecret).toBeTruthy();
    expect(stored?.mfaSecret).not.toBe(secret);
    expect(stored?.mfaBackupCodes).toHaveLength(8);

    const nextLogin = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    expect(nextLogin.body.mfaRequired).toBe(true);

    const verified = await request(app)
      .post('/api/auth/mfa/verify')
      .send({
        mfaToken: nextLogin.body.mfaToken,
        code: computeTotpCode(secret),
      })
      .expect(200);

    expect(verified.body.user.mfaEnabled).toBe(true);
  });

  it('lets an admin reset another account and revokes that session', async () => {
    const agent = request.agent(app);
    const adminLogin = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    const { setupToken, secret } = adminLogin.body as {
      setupToken: string;
      secret: string;
    };
    await agent
      .post('/api/auth/mfa/setup-confirm')
      .send({ setupToken, code: computeTotpCode(secret) })
      .expect(200);

    const kasirAgent = request.agent(app);
    await kasirAgent
      .post('/api/auth/login')
      .send({ username: 'kasir', password: 'unused' })
      .expect(200);

    const kasir = await UserModel.findOne({ username: 'kasir' });
    await enroll('kasir');
    const epochBefore = (await UserModel.findById(kasir!._id))!.sessionEpoch;

    await kasirAgent.get('/api/auth/me').expect(200);

    const reset = await agent
      .post(`/api/users/${String(kasir!._id)}/mfa/reset`)
      .expect(200);

    expect(reset.body.mfaEnabled).toBe(false);
    await kasirAgent.get('/api/auth/me').expect(401);

    const stored = await UserModel.findById(kasir!._id).select(
      '+mfaSecret +mfaBackupCodes',
    );
    expect(stored?.mfaEnabled).toBe(false);
    expect(stored?.mfaSecret).toBeUndefined();
    expect(stored?.mfaBackupCodes).toEqual([]);
    expect(stored?.sessionEpoch).toBe(epochBefore + 1);
  });
});

describe('MFA challenge', () => {
  it('accepts a current TOTP code and issues a session', async () => {
    const { secret } = await enroll('admin');
    const mfaToken = await challenge('admin');

    const verified = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: computeTotpCode(secret) })
      .expect(200);

    expect(verified.body.user.username).toBe('admin');
    expect(verified.headers['set-cookie']?.[0] ?? '').toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it('does not reveal whether a code or a backup code was wrong', async () => {
    await enroll('admin');
    const mfaToken = await challenge('admin');

    const response = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: '000000' })
      .expect(401);

    expect(response.body.reason).toBe('invalid_mfa');
  });
});

describe('backup codes', () => {
  it('consumes a code exactly once', async () => {
    const { backupCodes } = await enroll('admin');
    const code = backupCodes[0]!;

    await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: await challenge('admin'), code })
      .expect(200);

    const stored = await UserModel.findOne({ username: 'admin' }).select(
      '+mfaBackupCodes',
    );
    expect(stored?.mfaBackupCodes).toHaveLength(7);

    const replay = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: await challenge('admin'), code })
      .expect(401);

    expect(replay.body.reason).toBe('invalid_mfa');

    const afterReplay = await UserModel.findOne({
      username: 'admin',
    }).select('+mfaBackupCodes');
    expect(afterReplay?.mfaBackupCodes).toHaveLength(7);
  });

  it('reports how many codes remain with the MFA challenge', async () => {
    await enroll('admin');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    expect(login.body.backupCodesRemaining).toBe(8);
  });
});

describe('recovery code regeneration', () => {
  async function signedIn(
    username: string,
    password: string,
    secret: string,
  ) {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);

    await agent
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, code: computeTotpCode(secret) })
      .expect(200);

    return agent;
  }

  it('requires a session', async () => {
    await request(app).get('/api/auth/mfa/status').expect(401);
    await request(app)
      .post('/api/auth/mfa/backup-codes/regenerate')
      .send({ currentPassword: 'admin123', code: '123456' })
      .expect(401);
  });

  it('reports the remaining count and issues a fresh set', async () => {
    const { secret, backupCodes } = await enroll('admin');
    const agent = await signedIn('admin', 'admin123', secret);

    const status = await agent.get('/api/auth/mfa/status').expect(200);
    expect(status.body).toEqual({
      mfaEnabled: true,
      backupCodesRemaining: 8,
    });

    // Consuming one code lowers the count without regenerating anything.
    const consumed = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: await challenge('admin'), code: backupCodes[0]! })
      .expect(200);
    expect(consumed.body.user.username).toBe('admin');

    expect((await agent.get('/api/auth/mfa/status')).body).toEqual({
      mfaEnabled: true,
      backupCodesRemaining: 7,
    });

    const regenerated = await agent
      .post('/api/auth/mfa/backup-codes/regenerate')
      .send({
        currentPassword: 'admin123',
        code: computeTotpCode(secret),
      })
      .expect(200);

    expect(regenerated.body.backupCodes).toHaveLength(8);
    expect(regenerated.body.backupCodes).not.toContain(backupCodes[1]);

    expect((await agent.get('/api/auth/mfa/status')).body).toEqual({
      mfaEnabled: true,
      backupCodesRemaining: 8,
    });

    // Every old code is gone; a new one works.
    await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: await challenge('admin'), code: backupCodes[1]! })
      .expect(401);

    await request(app)
      .post('/api/auth/mfa/verify')
      .send({
        mfaToken: await challenge('admin'),
        code: regenerated.body.backupCodes[0],
      })
      .expect(200);
  });

  it('refuses a wrong password or authenticator code', async () => {
    const { secret } = await enroll('admin');
    const agent = await signedIn('admin', 'admin123', secret);

    const wrongPassword = await agent
      .post('/api/auth/mfa/backup-codes/regenerate')
      .send({
        currentPassword: 'not-my-password',
        code: computeTotpCode(secret),
      })
      .expect(422);

    expect(wrongPassword.body.fields.currentPassword).toBeTruthy();

    const wrongCode = await agent
      .post('/api/auth/mfa/backup-codes/regenerate')
      .send({ currentPassword: 'admin123', code: '000000' })
      .expect(401);

    expect(wrongCode.body.reason).toBe('invalid_mfa');

    // Neither failure rotated the stored set.
    expect((await agent.get('/api/auth/mfa/status')).body).toEqual({
      mfaEnabled: true,
      backupCodesRemaining: 8,
    });
  });
});
