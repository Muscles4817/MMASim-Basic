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
    /*
     * Two workers, not one per core.
     *
     * Vitest's default is a worker per available core, and on a four-core runner that starves the
     * main thread badly enough that its own reporting RPC gives up:
     *
     *   Error: [vitest-worker]: Timeout calling "onTaskUpdate"
     *
     * Vitest counts that as an unhandled error and exits 1 — with every test passing. That failed
     * the Pages build on runs 17, 18, 19, 21, 22 and 23 while reporting "1881 passed", which is
     * the worst failure mode available: a red build that says nothing is wrong.
     *
     * `maxWorkers` rather than `poolOptions.forks.maxForks`, because `poolOptions` is a *project*
     * option — set here, alongside `projects`, it would be read for a root project that does not
     * exist and silently do nothing. `maxWorkers`/`minWorkers` are in vitest's `NonProjectOptions`
     * and apply across every project, which is what this needs to be.
     *
     * Cheap in wall time, because the machine was already saturated: ~720s of test CPU over a
     * ~335s wall is about 2.1x parallelism on four cores, so the contention was buying scheduling
     * overhead rather than throughput.
     *
     * This is a ceiling on concurrency, not on the work. Nothing is skipped, and a genuine
     * unhandled rejection in product code still fails the run.
     */
    maxWorkers: 2,
    minWorkers: 1,

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
