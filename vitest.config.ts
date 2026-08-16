import { defineConfig } from 'vitest/config';

/**
 * Test tiers are separate vitest projects so the slow ones stay opt-in.
 *
 *   npm test            → unit + integration + statistical (fast, every commit)
 *   npm run test:long   → the 20-in-game-year regression suite
 *
 * See docs/01-architecture.md § "Testing strategy".
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/statistical/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'long-sim',
          include: ['tests/long-sim/**/*.test.ts'],
          environment: 'node',
          testTimeout: 900_000,
          hookTimeout: 900_000,
        },
      },
    ],
  },
});
