import type { Request, Response } from 'express';
import { databaseState } from '../db/connection.js';

/**
 * Operational health probe.
 *
 * Kept out of the API router and the rate limiter on purpose: a platform probe
 * must still get an answer while the database or the shared limiter store is
 * unavailable. It reports the connection state Mongoose already knows about
 * rather than opening a second connection of its own.
 */
export const HEALTH_TIMEOUT_MS = 5_000;

export function sendHealth(_req: Request, res: Response): void {
  const db = databaseState();
  res
    .status(db === 'up' ? 200 : 503)
    .json({ status: db === 'up' ? 'ok' : 'degraded', db });
}

/**
 * Bounds how long the serverless health probe waits for a cold-start
 * connection. The connect promise keeps running when the timeout wins, so the
 * next probe can observe the warm connection instead of throwing it away.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('health-check-timeout'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
