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
    rollupOptions: {
      output: {
        // One chunk for the whole app meant one cache key for the whole app: a tab's text change
        // invalidated React and CodeMirror with it, and every file downloaded again. These split the
        // libraries that change on their own schedule away from the code that changes daily — a
        // caching win, and `npm run check:weight`'s `entry_gzip` is what says whether the first visit
        // got smaller (it did: the ten non-runner tabs are `React.lazy` chunks, fetched when opened).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (/node_modules\/(@codemirror|@lezer|crelt|style-mod|w3c-keyname)\//.test(id)) {
            return 'vendor-editor';
          }
          if (/node_modules\/katex\//.test(id)) return 'vendor-katex';
          if (/node_modules\/lucide-react\//.test(id)) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
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
