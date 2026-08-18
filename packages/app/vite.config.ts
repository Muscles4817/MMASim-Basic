import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Where the app is served from.
 *
 * `/` locally and on any host that serves it at a domain root; `/<repo>/` on GitHub Pages, which
 * serves project sites from a subpath. Everything downstream — the service worker's scope, the
 * manifest, the icons — is written relative to this rather than to `/`, because a PWA that assumes
 * the root silently loses its offline support and its install prompt when it moves.
 */
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@mmasim/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@mmasim/data': fileURLToPath(new URL('../data/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: true },
});
