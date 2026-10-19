import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests cover pure TypeScript; nothing in them needs a DOM. IndexedDB comes from
    // fake-indexeddb, imported by the tests that need it.
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']
  }
});
