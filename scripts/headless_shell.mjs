/**
 * The renderer the UI gates launch (`scripts/headless_shell.mjs`).
 *
 * The primitive contract, the animation ratchet and the study-note gate all grade the same built
 * bundle on the same browser: `chrome-headless-shell`, the build the surface baseline was measured
 * with, and the only browser CI installs for them. A local machine with a full Chromium is a
 * fallback; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` overrides both.
 *
 * One module rather than three copies: the launch flags are part of what is being measured (device
 * scale, font hinting), and a gate that quietly runs with a different renderer is grading a
 * different page.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const CACHE = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
const ARGS = ['--no-sandbox', '--force-device-scale-factor=1', '--font-render-hinting=none'];

/** The headless shell, newest installed build first; the full browser only if no shell exists. */
function browserPath() {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override && fs.existsSync(override)) return override;
  if (fs.existsSync(CACHE)) {
    const builds = fs
      .readdirSync(CACHE)
      .filter((name) => name.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse();
    for (const build of builds) {
      for (const inner of fs.readdirSync(path.join(CACHE, build))) {
        const candidate = path.join(CACHE, build, inner, 'chrome-headless-shell');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return chromium.executablePath();
}

export function launchHeadlessShell() {
  return chromium.launch({ executablePath: browserPath(), args: ARGS });
}
