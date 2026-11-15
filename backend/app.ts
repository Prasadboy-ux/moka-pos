/**
 * Vercel entry point.
 *
 * Vercel's Express preset bundles the whole application into a single function
 * and forwards every request to it with the original URL intact, so Express's
 * router does the matching. That is the only way to serve paths of any depth:
 * the `api/` directory maps one route per file and cannot express a catch-all,
 * which is why `/api/health` used to work while `/api/auth/login` was answered
 * by the platform with a plain 404.
 *
 * The preset looks for a default export in `app.ts`, `index.ts` or `server.ts`
 * at the project root, or the same names under `src/`. This file is that
 * export; the application itself stays in `api/index.ts` so the tests and the
 * deployment exercise one implementation.
 */
export { default } from './api/index.js';
