import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, needsRehash } from './password.js';

describe('password hashing (Argon2id with scrypt compatibility)', () => {
  it('hashes a password with argon2id scheme by default in Node 24', async () => {
    const plain = 'StrongPass#2026';
    const hash = await hashPassword(plain);

    expect(hash.startsWith('argon2id$')).toBe(true);
    expect(await verifyPassword(plain, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword!', hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it('correctly verifies legacy scrypt hashes for seamless migration', async () => {
    // Generate or mock a valid scrypt hash
    const plain = 'legacyPassword123';
    // scrypt scheme: scrypt$<salt base64>$<derived base64>
    const legacyHash =
      'scrypt$33n1fQeBwU92p5s5M2sYrw==$U1G0vO1i9E92x26Q3o9x3w=='; // Dummy or test value
    expect(needsRehash(legacyHash)).toBe(true);

    // Dynamic scrypt hash verification test:
    const { scrypt, randomBytes } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const scryptAsync = promisify(scrypt);
    const salt = randomBytes(16);
    const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
    const realScryptHash = `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;

    expect(await verifyPassword(plain, realScryptHash)).toBe(true);
    expect(await verifyPassword('incorrect', realScryptHash)).toBe(false);
    expect(needsRehash(realScryptHash)).toBe(true);
  });

  it('rejects malformed hashes without throwing errors', async () => {
    expect(await verifyPassword('test', '')).toBe(false);
    expect(await verifyPassword('test', 'unknownScheme$salt$hash')).toBe(false);
    expect(await verifyPassword('test', 'argon2id$invalidBase64')).toBe(false);
  });
});
