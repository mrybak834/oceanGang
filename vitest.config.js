import { defineConfig } from 'vitest/config';

// Standalone config so vitest does NOT load vite.config.js — the app config's
// plugins (SpacetimeDB server, cloudflare tunnel, perf report) spawn processes
// that have no place in a unit-test run.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
