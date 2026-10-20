#!/usr/bin/env node
/**
 * Render `docs/media/arm-sim.gif`: the Step 10 result a beginner sees in the README's first screen.
 *
 * The picture is the course's own project, not a screenshot of a different lab: a two-link arm
 * whose tip follows a figure-8, with the joint angles solved by the law of cosines (the `02.3`
 * lesson) and a short trail showing where the tip has been. It is drawn on a canvas inside a
 * throwaway page, captured frame by frame with Playwright, and assembled by ffmpeg.
 *
 * Why not screenshot the workbench? Its arm lab is a six-joint technical tab, hidden in Beginner
 * View, and it does not trace a figure-8. This script needs only `npm ci` (playwright-core) and
 * `ffmpeg`; it does not start Vite.
 *
 * Requirements: `npm ci`, Chromium for Playwright (or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH), and
 * `ffmpeg` on PATH. Regenerate when the caption, size or path changes.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const WIDTH = 900;
const HEIGHT = 560;
const FRAMES = 120;
const FPS = 24;
const OUT = path.join(process.cwd(), 'docs', 'media', 'arm-sim.gif');
const FRAME_DIR = path.join(os.tmpdir(), `mechalab-arm-${process.pid}`);

function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    return chromium.executablePath();
  } catch {
    return undefined;
  }
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #070b14; }
  canvas { display: block; }
</style></head><body>
<canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  const L1 = 190, L2 = 150;
  const ox = 450, oy = 500;
  const trail = [];

  function ik(x, y) {
    const r2 = x * x + y * y;
    const c2 = Math.max(-1, Math.min(1, (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
    const q2 = -Math.acos(c2);
    const q1 = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    return [q1, q2];
  }

  window.draw = function (t) {
    const desired = [
      450 + 175 * Math.sin(t),
      250 + 95 * Math.sin(2 * t),
    ];
    const [q1, q2] = ik(desired[0] - ox, oy - desired[1]);
    const tip = [ox + L1 * Math.cos(q1) + L2 * Math.cos(q1 + q2),
                 oy - L1 * Math.sin(q1) - L2 * Math.sin(q1 + q2)];
    trail.push(tip);
    if (trail.length > 64) trail.shift();

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, ${WIDTH}, ${HEIGHT});

    // grid
    ctx.strokeStyle = '#111c30';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= ${WIDTH}; gx += 45) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ${HEIGHT}); ctx.stroke();
    }
    for (let gy = 0; gy <= ${HEIGHT}; gy += 45) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(${WIDTH}, gy); ctx.stroke();
    }

    // the figure-8 the tip is chasing
    ctx.strokeStyle = '#1e3a5f';
    ctx.setLineDash([5, 7]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 240; i += 1) {
      const a = (i / 240) * Math.PI * 2;
      const px = 450 + 175 * Math.sin(a);
      const py = 250 + 95 * Math.sin(2 * a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // tip trail
    trail.forEach(([x, y], index) => {
      const alpha = (index + 1) / trail.length;
      ctx.fillStyle = 'rgba(125, 211, 252, ' + (alpha * 0.8).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, 2.5 + alpha * 4, 0, Math.PI * 2); ctx.fill();
    });

    // links
    const elbow = [ox + L1 * Math.cos(q1), oy - L1 * Math.sin(q1)];
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(56,189,248,.55)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(elbow[0], elbow[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // joints
    [[ox, oy, 13, '#f59e0b'], [elbow[0], elbow[1], 11, '#34d399'], [tip[0], tip[1], 9, '#c084fc']]
      .forEach(([x, y, r, colour]) => {
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 3; ctx.stroke();
      });

    // caption
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 26px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Step 10 · 2-DOF arm · figure-8 tracking', 40, 56);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '500 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('x = sin(t)   y = sin(2t)   the trail is where the tip has been', 40, 92);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 16px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('joint 1 ' + (q1 * 180 / Math.PI).toFixed(1).padStart(6) + '°', 690, 500);
    ctx.fillText('joint 2 ' + (q2 * 180 / Math.PI).toFixed(1).padStart(6) + '°', 690, 526);
  };
</script></body></html>`;

const browser = await chromium.launch({
  ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
  await page.setContent(PAGE, { waitUntil: 'load' });
  mkdirSync(FRAME_DIR, { recursive: true });
  const canvas = page.locator('#c');
  for (let frame = 0; frame < FRAMES; frame += 1) {
    await page.evaluate((t) => window.draw(t), (frame / FRAMES) * Math.PI * 2);
    await canvas.screenshot({ path: path.join(FRAME_DIR, `f${String(frame).padStart(3, '0')}.png`) });
  }
} finally {
  await browser.close();
}

mkdirSync(path.dirname(OUT), { recursive: true });
const filter =
  'fps=' + FPS + ',scale=760:-1:flags=lanczos,split[s0][s1];' +
  '[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3';
const ffmpeg = spawnSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FRAME_DIR, 'f%03d.png'),
    '-vf', filter, '-loop', '0', OUT],
  { stdio: 'inherit' }
);
rmSync(FRAME_DIR, { recursive: true, force: true });
if (ffmpeg.status !== 0) {
  console.error('ffmpeg failed; is it installed and on PATH?');
  process.exit(ffmpeg.status ?? 1);
}
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
