import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Project Pages serve this workbench from https://<owner>.github.io/Mechatronics-Roadmap/,
// so every asset URL in a production bundle needs that prefix, while `npm run dev` keeps
// serving from the root. PAGES_BASE overrides it for a different host path.
const PAGES_BASE = process.env.PAGES_BASE ?? '/Mechatronics-Roadmap/';

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
  },
}));
