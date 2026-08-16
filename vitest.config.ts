import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** Same aliases the app's own Vite config uses, so the UI tier resolves workspace sources. */
const workspaceAliases = {
  '@mmasim/engine': fileURLToPath(new URL('./packages/engine/src/index.ts', import.meta.url)),
  '@mmasim/data': fileURLToPath(new URL('./packages/data/src/index.ts', import.meta.url)),
};

/**
 * Test tiers are separate vitest projects so the slow ones stay opt-in.
 *
 *   npm test            → unit + integration + statistical + ui (fast, every commit)
 *   npm run test:ui     → just the browser-level playability suite
 *   npm run test:long   → the 20-in-game-year regression suite
 *
 * Note that a bare `vitest run` executes every project including long-sim; the npm scripts
 * below select tiers explicitly so the fast loop stays fast.
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
        // Mounts the real app in jsdom and drives it with real clicks. This is the tier
        // that answers 'is it playable', which neither a typecheck nor a dev-server 200 does.
        plugins: [react()],
        resolve: { alias: workspaceAliases },
        test: {
          name: 'ui',
          include: ['tests/ui/**/*.test.tsx'],
          environment: 'jsdom',
          testTimeout: 30_000,
          setupFiles: ['./tests/ui/setup.ts'],
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
