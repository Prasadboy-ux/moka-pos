import pino from 'pino';

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
const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

export const logger = pino({ level });
