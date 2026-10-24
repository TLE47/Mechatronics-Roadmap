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
          // Vim is 41 kB gzipped of keymap nobody pays for unless they turn the keys on, so it gets
          // its own chunk *and* is imported dynamically (`pythonEditorImpl.tsx`). Chunking it with
          // `@codemirror` would have put it in front of every learner who opens the editor, and the
          // catch-all `vendor` chunk is statically reachable from the entry, which is what put
          // 149 kB of CodeMirror back in `entry_gzip` the first time this was built.
          if (/node_modules\/@replit\//.test(id)) return 'vendor-vim';
          // `avr8js` is only reached by the Board tab's Run handler (`import('../../avrSim.ts')`), and
          // the catch-all `vendor` chunk is statically reachable from the entry: without this line the
          // emulator's 14 kB lands in every first visit for a tab nobody opened, which is exactly the
          // mistake the comment above records for CodeMirror.
          if (/node_modules\/avr8js\//.test(id)) return 'vendor-avr';
          // `@supabase/supabase-js` is reached only by the account panel's
          // `import('@supabase/supabase-js')` in `app/src/accounts.ts`, but this catch-all would park
          // it in the statically preloaded `vendor`
          // chunk — so a CI build, which sets the Supabase variables and therefore ships the library,
          // paid its ~59 kB on the first paint of every visit, signed in or not (`entry_gzip` caught
          // it at 532.6 kB against a 480 kB ceiling). Its own chunk is fetched when someone opens the
          // account panel, so the sign-in configuration costs the first visit nothing.
          if (/node_modules\/@supabase\//.test(id)) return 'vendor-auth';
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
