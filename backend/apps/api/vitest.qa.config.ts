import { defineConfig } from 'vitest/config';

/**
 * QA workflow/access suite over the real HTTP stack. Global setup migrates a
 * throwaway `qa_test_<uuid>` PostgreSQL schema, starts a compiled copy of the
 * API against it, and drops the schema afterwards — no shared or seeded data
 * is read or modified.
 *
 * Tests assert the INTENDED policy. A failing test is a reproduced defect.
 */
export default defineConfig({
  test: {
    include: ['test/qa/**/*.qa-spec.ts'],
    globalSetup: ['test/qa/global-setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
