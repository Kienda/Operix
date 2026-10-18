import { defineConfig } from 'vitest/config';

/** P0 regression harness: compiled Nest HTTP server and isolated DB schemas. */
export default defineConfig({
  test: {
    include: ['test/p0*.e2e.test.mjs'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
