import { defineConfig } from 'vitest/config';

// Vitest 4 no longer excludes dist automatically. Run authored sources once.
export default defineConfig({ test: { include: ['src/**/*.spec.ts'] } });
