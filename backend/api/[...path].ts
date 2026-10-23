/**
 * Vercel catch-all entry.
 *
 * `api/index.ts` only receives `/api` (and `/api/`). Every nested route has to
 * land here, because a rewrite destination cannot preserve the matched path:
 * `/api/health` rewritten to `/api` arrives as `/api` and the router has nothing
 * to match. Re-exporting the same Express app keeps both entry points on one
 * implementation and leaves `req.url` intact for Express.
 */
export { default } from './index.js';
