import { defineConfig } from 'vitest/config';

/** GHT pilot release gate: compiled Nest HTTP server, isolated DB schema, SMTP via Mailpit. */
export default defineConfig({
  test: {
    include: ['test/pilot*.e2e.test.mjs'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 180000,
  },
});
