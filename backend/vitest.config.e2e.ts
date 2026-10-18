import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests (`test/**\/*.e2e.ts`). These drive the real Express app with
 * Supertest. Anything that needs a database needs a MongoDB deployment that
 * supports multi-document transactions — Atlas, or `mongodb-memory-server` as a
 * single-node replica set. See test/README.md.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e.ts'],
    setupFiles: ['./test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Shared Atlas free tier is slow to connect; give it room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Sequential: each suite clears collections, so parallel files would race
    // each other's fixtures.
    fileParallelism: false,
  },
});