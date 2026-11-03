import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServerlessApp } from '../api/index.js';

/**
 * The serverless wrapper's health probe must not depend on the connection it
 * reports on. This file deliberately starts no database: the injected connector
 * fails (or hangs) so the probe's degraded path is the one under test.
 */

describe('serverless health probe without a database', () => {
  it('answers 503 when the lazy connect fails instead of 500', async () => {
    const app = createServerlessApp({
      connect: async () => {
        throw new Error('atlas-unreachable');
      },
      healthTimeoutMs: 50,
    });

    const response = await request(app).get('/api/health').expect(503);

    expect(response.body.status).toBe('degraded');
    expect(response.body.db).not.toBe('up');
  });

  it('answers 503 when the lazy connect exceeds the probe budget', async () => {
    const app = createServerlessApp({
      connect: () => new Promise<void>(() => {}),
      healthTimeoutMs: 10,
    });

    const started = Date.now();
    const response = await request(app).get('/api/health').expect(503);

    expect(response.body.status).toBe('degraded');
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('still gates non-health routes on the connection', async () => {
    const app = createServerlessApp({
      connect: async () => {
        throw new Error('atlas-unreachable');
      },
      healthTimeoutMs: 50,
    });

    const response = await request(app).get('/api/config').expect(500);

    expect(response.body).toEqual({
      error: 'internal',
      message: 'Something went wrong on our side. Please try again.',
    });
  });
});
