/**
 * The release identity, injected at build time by `vite.config.ts` from `package.json`.
 *
 * One version, one place: the config reads `package.json` and replaces `__APP_VERSION__`, so there is
 * no second literal here to drift from it. The `typeof` guard is what makes this module importable
 * outside Vite (Node, a unit test): an undeclared identifier is safe inside `typeof`, and the fallback
 * names a development build rather than pretending to be a release.
 */
declare const __APP_VERSION__: string;

/** Printed in the footer as `v2.0.0`, so a bug report can name the build it came from. */
export const APP_VERSION = `v${
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'
}`;

/** Printed beside the release version: the commit and the day the bundle was built. */
declare const __APP_BUILD__: string;

/** `ffa4069 · 2026-11-11`, or `local build` outside Vite, where there is no commit to name. */
export const APP_BUILD =
  typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'local build';
