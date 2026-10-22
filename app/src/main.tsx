import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted, so the UI does not depend on a CDN or on the machine having Inter installed; the
// `@font-face` rules arrive with these imports and src/index.css names the two families. Weight-axis
// variable woff2 with `font-display: swap`, one file per subset, and Latin is the only one a
// Latin-script visit downloads (48 KB sans, 40 KB mono).
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import App from './App';
import { flushBulkStorage, hydrateBulkStorage } from './bulkStorage';
import './index.css';

/**
 * Read the bulk stores before the first render.
 *
 * Drafts, filed versions, the learning log, notes, review schedules and sittings live in IndexedDB
 * (`bulkStorage.ts`) and are read through an in-memory copy of it. Filling that copy is what lets every
 * store module keep a synchronous `Storage` interface: by the time `App` reads in its `useState`
 * initializers the cache holds what a previous visit wrote, so the first paint is the learner's own
 * work rather than an empty shell that fills in a frame later.
 *
 * A browser that refuses a database (private mode, blocked storage) resolves to the bucket the app has
 * always used, and this await is then one microtask long.
 */
async function start(): Promise<void> {
  try {
    await hydrateBulkStorage();
  } catch {
    // Nothing to do: `bulkStorage()` falls back to `localStorage`, and the lesson still opens.
  }
  // A queued write is one tick old; flushing on the way out is what stops the last edit from needing
  // that tick. Both events fire before the page is torn down, and IndexedDB commits a transaction that
  // was already issued.
  window.addEventListener('pagehide', () => {
    void flushBulkStorage();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushBulkStorage();
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void start();
