import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Project Pages serve this workbench from https://<owner>.github.io/Mechatronics-Roadmap/,
// so every asset URL in a production bundle needs that prefix, while `npm run dev` keeps
// serving from the root. PAGES_BASE overrides it for a different host path.
const PAGES_BASE = process.env.PAGES_BASE ?? '/Mechatronics-Roadmap/';

// Cross-origin isolation is what lets the browser hand out a SharedArrayBuffer, which is what lets
// the Python worker be interrupted in place (see app/src/components/tabs/TabPyodideRunner.tsx).
// GitHub Pages cannot send headers, so production uses app/public/sw.js (which also caches the app for
// offline use); a local server can just send them, which is why the browser suites run isolated without
// a service worker.
// Defined in scripts/isolation-headers.mjs so the test servers send exactly the same pair.
import { ISOLATION_HEADERS } from './scripts/isolation-headers.mjs';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  root: 'app',
  base: command === 'build' ? PAGES_BASE : '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    headers: ISOLATION_HEADERS,
  },
  preview: {
    headers: ISOLATION_HEADERS,
  },
}));
