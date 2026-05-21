import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ajfisher/presso-core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@ajfisher/presso-runtime': new URL('./packages/runtime/src/index.ts', import.meta.url).pathname,
      '@ajfisher/presso-export': new URL('./packages/export/src/index.ts', import.meta.url).pathname,
      '@ajfisher/presso-create': new URL('./packages/create/src/index.ts', import.meta.url).pathname,
      '@ajfisher/presso-server': new URL('./packages/server/src/index.ts', import.meta.url).pathname
    }
  },
  test: {
    include: ['packages/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 15000
  }
});
