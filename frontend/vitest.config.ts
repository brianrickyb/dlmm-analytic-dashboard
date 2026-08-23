import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for component tests (AuthContext, MarketSignalPage); pure-logic tests
    // (il/yield) run fine under it too.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
