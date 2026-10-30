import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// One release identity, one file (`package.json`). The footer reads it through
// `app/src/appVersion.ts`, and this define is the only place the value enters the bundle - a second
// typed version would be the thing that drifts after the next release.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

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

/**
 * KaTeX's stylesheet, shipped with only the woff2 fonts it names.
 *
 * The package's CSS lists three sources per face — woff2, woff and ttf — for browsers that needed
 * fallbacks about a decade ago. Vite emits every file a `url()` names, so importing the stylesheet
 * unchanged would put **1.08 MB** of fonts in `dist/` (260 kB of woff2 plus 303 kB of woff and 514 kB
 * of ttf) for the woff2 that every current browser loads instead. This keeps the layout rules and the
 * first source of each `@font-face`, and drops the other two.
 *
 * Maths used to come from a jsdelivr copy of this file, pinned to 0.16.21 while the JavaScript package
 * was 0.16.47; self-hosting puts both on the installed version, keeps formulas rendering with no
 * network beyond the page, and makes `check:weight` measure the real cost instead of skipping a
 * remote stylesheet (`entryNames` used to ignore it).
 */
/**
 * The theme route reads `index.css?raw` to print the palette (`themeTokens.ts`) and strips the
 * stylesheet's comments itself before parsing — they are prose for the maintainer, not data. Doing
 * that strip at build time keeps that prose out of every learner's download: `index.css` explains
 * itself at length, and shipping it verbatim made those explanations several kilobytes of the main
 * chunk for a page that never showed them.
 */
function rawCssWithoutComments(): Plugin {
  return {
    name: 'mechalab:raw-css-without-comments',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('/app/src/index.css?raw')) return null;
      const file = id.slice(0, -'?raw'.length);
      this.addWatchFile(file);
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
      return `export default ${JSON.stringify(css)};`;
    },
  };
}

function katexWoff2Only(): Plugin {
  return {
    name: 'mechalab:katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]katex[\\/]dist[\\/]katex(\.min)?\.css$/.test(id)) return null;
      const next = code.replace(
        /,url\([^)]*\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g,
        ''
      );
      return next === code ? null : { code: next, map: null };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  root: 'app',
  // `docs/ACCOUNTS.md` puts `.env.local` at the repository root, and Vite would otherwise look for it
  // beside `root` — `app/` — so a developer followed the instructions exactly and got the local-only
  // build ('Cloud sync is not wired into this deployment yet'). The root is the one `.gitignore`
  // already covers, and CI passes the variables in the environment, which outranks this either way.
  envDir: '..',
  base: command === 'build' ? PAGES_BASE : '/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [rawCssWithoutComments(), katexWoff2Only(), react(), tailwindcss()],
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
