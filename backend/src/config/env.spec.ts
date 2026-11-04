import { afterEach, describe, expect, it } from 'vitest';
import { adminMfaEnforced, resetEnv } from './env.js';

const ORIGINAL_ENV = { ...process.env };

function productionEnv(): void {
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SECURE = 'true';
  process.env.SESSION_SECRET = 'a'.repeat(64);
  process.env.CORS_ORIGIN = 'https://moka.example.com';
}

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  resetEnv();
}

afterEach(restoreEnv);

describe('adminMfaEnforced', () => {
  it('is on outside tests by default', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MFA_ENFORCE_ADMIN;
    resetEnv();

    expect(adminMfaEnforced()).toBe(true);
  });

  it('is off in tests by default', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.MFA_ENFORCE_ADMIN;
    resetEnv();

    expect(adminMfaEnforced()).toBe(false);
  });

  it('honours an explicit override outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.MFA_ENFORCE_ADMIN = 'false';
    resetEnv();
    expect(adminMfaEnforced()).toBe(false);

    process.env.MFA_ENFORCE_ADMIN = 'true';
    resetEnv();
    expect(adminMfaEnforced()).toBe(true);
  });

  it('is on in production and cannot be disabled there', () => {
    productionEnv();
    delete process.env.MFA_ENFORCE_ADMIN;
    resetEnv();
    expect(adminMfaEnforced()).toBe(true);

    process.env.MFA_ENFORCE_ADMIN = 'false';
    resetEnv();
    expect(() => adminMfaEnforced()).toThrow(/cannot be disabled/i);
  });
});
