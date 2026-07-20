import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@apps': new URL('./src/apps', import.meta.url).pathname,
      '@modules': new URL('./src/modules', import.meta.url).pathname,
      '@shared': new URL('./src/shared', import.meta.url).pathname,
      '@tools': new URL('./src/tools', import.meta.url).pathname,
      '@test': new URL('./test', import.meta.url).pathname,
    },
  },
  test: {
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
});
