import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.js', 'server/test/**/*.test.js'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ['default'],
  },
});