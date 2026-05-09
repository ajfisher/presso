import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@presso/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@presso/runtime': new URL('./packages/runtime/src/index.ts', import.meta.url).pathname,
      '@presso/export': new URL('./packages/export/src/index.ts', import.meta.url).pathname,
      '@presso/create': new URL('./packages/create/src/index.ts', import.meta.url).pathname,
      '@presso/server': new URL('./packages/server/src/index.ts', import.meta.url).pathname
    }
  },
  test: {
    include: ['packages/**/*.test.ts'],
    testTimeout: 15000
  }
});
