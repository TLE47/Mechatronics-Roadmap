#!/usr/bin/env node
/**
 * The home-screen icons (`npm run icons`).
 *
 * `favicon.svg` is the one drawing: the two-link arm on the workbench's own dark. A manifest needs
 * raster PNGs at 192 and 512, iOS wants a 180 px `apple-touch-icon`, and Android's adaptive mask
 * needs a version whose artwork sits inside the 80% safe circle. Rendering all four from the SVG in
 * one browser keeps them from drifting apart: change the drawing, run this, and every size follows.
 *
 * The rendering is Chromium, not an image library, because the repository already ships Playwright
 * for its suites and a native `sharp`/`resvg` dependency would be a second toolchain for four files.
 * Each page is built at the icon's exact size with `devicePixelRatio: 1`, so the PNG's pixels are the
 * icon's pixels; the SVG is vector, so there is nothing to resample.
 *
 * Writes into `app/public/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
 * `apple-touch-icon.png`) and prints what it wrote. The manifest and `index.html` name these files;
 * `scripts/e2e_mobile.mjs` fails if the manifest points at an icon that is not there.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';

const PUBLIC = path.join('app', 'public');
const SVG = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8');
const DATA_URI = `data:image/svg+xml;base64,${Buffer.from(SVG, 'utf8').toString('base64')}`;

/** `inset` is the fraction of the canvas left as bleed: 0 for the launcher, 0.2 for the mask. */
const ICONS = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.2 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.08 },
];

function pngSize(buffer) {
  // IHDR's width and height are big-endian uint32 at bytes 16 and 20.
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function main() {
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const icon of ICONS) {
      const art = Math.round(icon.size * (1 - icon.inset));
      await page.setViewportSize({ width: icon.size, height: icon.size });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>
           html, body { margin: 0; width: ${icon.size}px; height: ${icon.size}px; background: #070b12; }
           body { display: grid; place-items: center; }
           img { display: block; width: ${art}px; height: ${art}px; }
         </style></head><body><img alt="" src="${DATA_URI}"></body></html>`
      );
      const file = path.join(PUBLIC, icon.file);
      await page.screenshot({ path: file, omitBackground: false, animations: 'disabled' });
      const { width, height } = pngSize(fs.readFileSync(file));
      if (width !== icon.size || height !== icon.size) {
        throw new Error(`${icon.file} came out ${width}x${height}, expected ${icon.size}`);
      }
      console.log(`  ${icon.file.padEnd(24)} ${width}x${height}  ${fs.statSync(file).size} bytes`);
    }
  } finally {
    await browser.close();
  }
}

await main();
