import pino from 'pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Structured logging.
 *
 * One pino instance for the process. `console.log` was fine while the API was
 * one file; with request logging, 5xx traces and Mongo connection events all
 * going to stdout, a machine-readable line per event is what a log drain
 * (Railway, Render, Datadog) actually understands.
 *
 * Level comes from LOG_LEVEL rather than env(): this module is imported by the
 * error handler, which runs before anything guarantees the rest of the env is
 * present, and a logger that crashes on boot takes the whole API with it.
 * Tests default to silent so vitest output stays readable.
 */
const LOG_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

const fallbackLevel = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
const requestedLevel = process.env.LOG_LEVEL?.trim().toLowerCase();

// pino throws on an unknown level, and this runs before env validation. A typo
// in a deployment variable must degrade to useful logging, not take the API
// down before it can serve a request.
const level =
  requestedLevel && LOG_LEVELS.has(requestedLevel)
    ? requestedLevel
    : fallbackLevel;

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Request/response logging deliberately uses an allowlist.
 *
 * pino-http's defaults include every header, which means the session cookie and
 * any proxy authorization header would be written to the log drain on every
 * authenticated request. These serializers keep the operational fields and drop
 * the rest; the redaction config above is a second line of defence for any
 * caller that logs a header object manually.
 */
export function requestLogSerializer(
  req: IncomingMessage,
): Record<string, unknown> {
  const id = (req as IncomingMessage & { id?: unknown }).id;

  return {
    id,
    method: req.method,
    // Query strings can carry a customer name or phone from the order/report
    // search. The path is enough to identify the operation.
    url: req.url?.split('?')[0],
    remoteAddress: req.socket?.remoteAddress,
    remotePort: req.socket?.remotePort,
  };
}

export function responseLogSerializer(
  res: ServerResponse,
): Record<string, unknown> {
  return { statusCode: res.statusCode };
}
