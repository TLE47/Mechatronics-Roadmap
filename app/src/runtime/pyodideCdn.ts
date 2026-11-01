/**
 * Where Pyodide is fetched from (`app/src/runtime/pyodideCdn.ts`).
 *
 * One address, read by the lesson runner and by the free-study studio. Before this, the URL and the
 * `window` override lived inside `TabPyodideRunner.tsx`, so a second surface that runs Python would
 * have carried a second copy — and a hosted build that sets `__mechalabPyodideCdnUrl` would have
 * moved only one of them.
 *
 * The override exists for the browser suites and for a mirror; production reads the default. A
 * module with no `window` (the SSR smoke test, Node) still answers: the default is a constant, not a
 * lookup that can throw.
 */

declare global {
  interface Window {
    __mechalabPyodideCdnUrl?: string;
  }
}

export const DEFAULT_PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

export function pyodideCdn(): string {
  return (typeof window !== 'undefined' && window.__mechalabPyodideCdnUrl) || DEFAULT_PYODIDE_CDN;
}
