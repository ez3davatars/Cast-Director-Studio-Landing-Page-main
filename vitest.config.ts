import path from 'path';
import { defineConfig } from 'vitest/config';

// Vitest runs the website's unit/contract tests in a Node environment. The live
// backend integration script (test/integration/*.mjs) is intentionally excluded
// here so `npm test` stays green offline; run it separately against the local
// Supabase stack (see report / test/integration/live-checkout.mjs).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
  },
});
