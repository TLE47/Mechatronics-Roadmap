import { chromium } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path';
import { ensureBuilt, startStaticServer } from './scripts/e2e_pages_bundle.mjs';
import { seedTourSeen } from './scripts/tour_seed.mjs';
const cache = path.join(process.env.HOME, '.cache', 'ms-playwright');
let exe = null;
for (const build of fs.readdirSync(cache).filter((n) => n.startsWith('chromium_headless_shell-'))) {
  for (const inner of fs.readdirSync(path.join(cache, build))) {
    const c = path.join(cache, build, inner, 'chrome-headless-shell');
    if (fs.existsSync(c)) exe = c;
  }
}
await ensureBuilt();
const { server, port } = await startStaticServer();
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await seedTourSeen(ctx);
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${port}/Mechatronics-Roadmap/`, { waitUntil: 'load' });
await p.waitForSelector('[data-testid="btn-theme-toggle"]', { timeout: 30000 });
if ((await p.getByTestId('editor-tab-workflow').count()) === 0) await p.getByTestId('btn-mode-advanced').click().catch(() => {});
await p.getByTestId('editor-tab-workflow').click();
await p.getByTestId('panel-workflow').waitFor({ timeout: 20000 });
await p.waitForSelector('[data-testid="workflow-canvas"]', { timeout: 20000 });
await p.waitForTimeout(800);
const read = () => p.evaluate(() => {
  const c = document.querySelector('[data-testid="workflow-canvas"]');
  const r = c.getBoundingClientRect();
  const se = document.scrollingElement;
  return { top: Math.round(r.top), h: Math.round(r.height), doc: [Math.round(se.scrollTop), se.scrollHeight, se.clientHeight],
    htmlOv: getComputedStyle(document.documentElement).overflow, bodyOv: getComputedStyle(document.body).overflow };
});
console.log('before', JSON.stringify(await read()));
await p.getByTestId('workflow-canvas').evaluate((el) => el.scrollIntoView({ block: 'center' }));
await p.waitForTimeout(400);
console.log('after', JSON.stringify(await read()));
await b.close(); server.close();
