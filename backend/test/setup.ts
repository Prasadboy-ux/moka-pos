/**
 * Vitest global setup.
 *
 * The app refuses to start without a database URI and a session secret, by
 * design — a silent default is how a production deploy ends up signing cookies
 * with a well-known key. Tests supply obviously-fake values instead.
 *
 * `??=` so a real `.env.test` still wins if one is ever added.
 */
process.env.NODE_ENV ??= 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/moka-pos-test';
process.env.SESSION_SECRET ??= 'test-only-secret-at-least-32-characters-long';
process.env.COOKIE_SECURE ??= 'false';
