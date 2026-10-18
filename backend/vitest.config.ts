import { defineConfig } from 'vitest/config';

/**
 * Unit tests. Co-located with the code under test (`src/**\/*.spec.ts`).
 *
 * E2E tests live in `test/**\/*.e2e.ts` and are run by `npm run test:e2e`. The
 * two globs are deliberately disjoint — an earlier `**\/*.spec.ts` pattern also
 * matched `*.e2e-spec.ts`, so `npm test` silently required a live database.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});