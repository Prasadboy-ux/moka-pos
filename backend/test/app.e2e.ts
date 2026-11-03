import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ApiError } from '../src/lib/errors.js';
import { databaseState } from '../src/db/connection.js';

/**
 * Proves the two things every later test relies on: the app assembles without a
 * database, and the error envelope is produced by one place rather than by each
 * route remembering to build one.
 */
describe('app shell', () => {
  const app = createApp();

  it('answers GET /api/health', async () => {
    const response = await request(app).get('/api/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('db');
  });

  it('reports the database as down when nothing is connected', async () => {
    const response = await request(app).get('/api/health');

    expect(databaseState()).not.toBe('up');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'degraded', db: databaseState() });
  });

  it('returns the error envelope for an unknown route', async () => {
    const response = await request(app).get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not-found');
    // The frontend shows `message` to the user, so it must name the route.
    expect(response.body.message).toContain('GET /api/nope');
  });

  it('does not leak the server implementation', async () => {
    const response = await request(app).get('/api/nope');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('forbids caching of API responses', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('error helpers', () => {
  it('omits reason when the failure is not attributable', () => {
    expect(ApiError.conflict(undefined, 'Duplicate.').body).toEqual({
      error: 'conflict',
      message: 'Duplicate.',
    });
  });

  it('carries the reason when the service knows it', () => {
    expect(ApiError.conflict('username-taken', 'Taken.').body.reason).toBe(
      'username-taken',
    );
  });

  it('keeps fields off the envelope when there are none', () => {
    expect(ApiError.validation('Bad.').body).toEqual({
      error: 'validation',
      message: 'Bad.',
    });
  });
});
