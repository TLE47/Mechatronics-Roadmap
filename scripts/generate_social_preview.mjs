#!/usr/bin/env node
/**
 * Repository Social Preview — `scripts/generate_social_preview.mjs`
 *
 * GitHub's social preview (Settings -> General -> Social preview) takes a 1200x630 PNG and nothing
 * else; there is no API for it, so the image has to be uploaded by hand once. This script produces
 * that exact file, from the repository's own hero GIF and its own honest numbers, so the preview can
 * be regenerated instead of redrawn in an image editor:
 *
 *   node scripts/generate_social_preview.mjs           # writes docs/media/social-preview.png
 *   node scripts/generate_social_preview.mjs --check   # fails if the PNG is missing or stale
 *
 * The frame is rendered by Chromium at 1200x630 with the design fixed in this file: deep navy
 * (#0F172A), teal accent (#0D9488), the arm GIF as the visual, and the two numbers a stranger needs
 * ("zero install", "48 lessons"). Text is HTML, so it is selectable and legible at every scale, and
 * the layout cannot drift from the repository: the lesson count is read from the lessons on disk the
 * same way the README's generator counts them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gifPath = path.join(repoRoot, 'docs', 'media', 'arm-sim.gif');
const outPath = path.join(repoRoot, 'docs', 'media', 'social-preview.png');
const WIDTH = 1200;
const HEIGHT = 630;

/** The same lesson count the README's route table carries, counted from the lesson files themselves. */
function lessonCount() {
  const dirs = ['track-p', 'stage-0'];
  const tracks = fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d\d-/.test(entry.name))
    .map((entry) => entry.name);
  let count = 0;
  for (const dir of [...dirs, ...tracks]) {
    for (const file of fs.readdirSync(path.join(repoRoot, dir))) {
      // `P.M-` and `S0.M-` are the two milestone pages; they are lessons like the numbered ones and
      // are in the 48 the README quotes.
      if (/^(P|S0|\d\d)\.[\dM]+-.*\.md$/.test(file)) count += 1;
    }
  }
  return count;
}

function html(lessons) {
  // Inline the GIF: `setContent` pages have no origin of their own, so a file:// image is dropped and
  // the preview renders with a broken-image icon. A data URI needs no network and cannot go stale.
  const gif = `data:image/gif;base64,${fs.readFileSync(gifPath).toString('base64')}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { --navy: #0f172a; --deep: #1e3a5f; --teal: #0d9488; --gold: #d4a017; --ink: #e2e8f0; --muted: #94a3b8; }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: var(--navy);
         font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--ink); }
  .frame { position: relative; width: 100%; height: 100%; display: flex; align-items: center;
           padding: 64px 72px; gap: 56px;
           background:
             radial-gradient(900px 620px at 88% 8%, rgba(13,148,136,.28), transparent 62%),
             radial-gradient(700px 520px at 4% 96%, rgba(30,58,95,.85), transparent 60%),
             linear-gradient(150deg, #0f172a 0%, #0b1220 100%); }
  .copy { flex: 1 1 auto; min-width: 0; }
  .eyebrow { font-size: 20px; letter-spacing: .22em; text-transform: uppercase; color: var(--teal); font-weight: 700; }
  h1 { font-size: 74px; line-height: 1.02; letter-spacing: -.02em; font-weight: 800; margin-top: 18px; }
  h1 span { color: var(--teal); }
  .tagline { margin-top: 22px; font-size: 27px; line-height: 1.35; color: var(--ink); max-width: 15em; }
  .rule { width: 64px; height: 4px; margin-top: 28px; background: var(--gold); border-radius: 2px; }
  .chips { display: flex; gap: 10px; margin-top: 30px; flex-wrap: nowrap; }
  .chip { font-size: 17px; font-weight: 600; padding: 8px 14px; border-radius: 999px; white-space: nowrap;
          border: 1px solid rgba(148,163,184,.35); color: var(--ink); background: rgba(15,23,42,.55); }
  .chip.accent { border-color: rgba(13,148,136,.65); color: #5eead4; }
  .shot { flex: 0 0 470px; position: relative; }
  .shot img { width: 100%; display: block; border-radius: 16px;
              border: 1px solid rgba(148,163,184,.28);
              box-shadow: 0 30px 70px rgba(2,6,23,.65); }
  .shot figcaption { margin-top: 14px; font-size: 15px; color: var(--muted); letter-spacing: .04em; }
  .url { position: absolute; left: 72px; bottom: 34px; font-size: 16px; letter-spacing: .06em; color: var(--muted); }
</style></head>
<body><div class="frame">
  <div class="copy">
    <div class="eyebrow">MechaLab · free curriculum</div>
    <h1>Mechatronics<br><span>Roadmap</span></h1>
    <div class="tagline">Zero coding, electronics or maths to a verified simulated robot arm — in your browser.</div>
    <div class="rule"></div>
    <div class="chips">
      <span class="chip accent">No install</span>
      <span class="chip accent">$0 hardware</span>
      <span class="chip">${lessons} lessons</span>
      <span class="chip">10 steps · 1 arm</span>
    </div>
  </div>
  <figure class="shot">
    <img src="${gif}" alt="A simulated two-link arm tracking a figure-8 path">
    <figcaption>Step 10 · the arm you build towards</figcaption>
  </figure>
  <div class="url">tle47.github.io/Mechatronics-Roadmap</div>
</div></body></html>`;
}

async function render() {
  const lessons = lessonCount();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(html(lessons), { waitUntil: 'load' });
    await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  } finally {
    await browser.close();
  }
  const size = fs.statSync(outPath).size;
  if (!size) throw new Error(`${outPath} was written empty`);
  console.log(`[ok] ${path.relative(repoRoot, outPath)} - ${WIDTH}x${HEIGHT}, ${lessons} lessons, ${(size / 1024).toFixed(0)} KB`);
}

function check() {
  if (!fs.existsSync(outPath)) throw new Error(`${path.relative(repoRoot, outPath)} is missing - run this script without --check`);
  const png = fs.readFileSync(outPath);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== WIDTH || height !== HEIGHT) throw new Error(`${path.relative(repoRoot, outPath)} is ${width}x${height}, not ${WIDTH}x${HEIGHT}`);
  console.log(`[ok] ${path.relative(repoRoot, outPath)} - ${width}x${height}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      if (process.argv.includes('--check')) check();
      else await render();
    } catch (error) {
      console.error(`[FAIL] social preview: ${error.message}`);
      process.exit(1);
    }
  })();
}
