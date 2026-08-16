import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
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
