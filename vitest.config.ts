import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests cover pure TypeScript; nothing in them needs a DOM.
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
