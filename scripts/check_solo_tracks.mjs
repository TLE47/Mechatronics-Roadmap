#!/usr/bin/env node
/** Every solo chip is a real, decodable recording (`scripts/check_solo_tracks.mjs`). */
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { DRONE_ID, MUSIC_TAPES, SOLO_TRACKS } from '../app/src/audio/musicCatalogue.ts';

const executablePath = resolveChromiumExecutable();
if (!executablePath) { console.error('[FAIL] no Chromium'); process.exit(2); }
ensureBuilt();
const assets = fs.readdirSync('dist/assets');
const wanted = [];
let bad = 0;
for (const track of SOLO_TRACKS) {
  const tape = MUSIC_TAPES.find((entry) => entry.id === track.tapeId);
  if (!tape || track.tapeId === DRONE_ID) { bad += 1; console.error(`[FAIL] ${track.id}: ${track.tapeId} is not a bundled recording`); continue; }
  const source = `app/src/audio/assets/music/${tape.id}.m4a`;
  const head = fs.existsSync(source) ? fs.readFileSync(source).subarray(4, 8).toString('latin1') : '';
  const emitted = assets.find((name) => name.startsWith(tape.id) && name.endsWith('.m4a'));
  const ok = head === 'ftyp' && emitted && !tape.composed;
  if (!ok) { bad += 1; console.error(`[FAIL] ${track.id}: tape=${tape.id} ftyp=${head} emitted=${emitted} composed=${tape.composed}`); }
  else { console.log(`  file ${track.id}: ${tape.title} by ${tape.artist} — MP4 container, ${fs.statSync(source).size} B, ${tape.licence}`); wanted.push({ id: track.id, tapeId: tape.id, emitted }); }
}
const { server, port } = await startStaticServer();
const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const decoded = await page.evaluate(async (names) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const out = [];
    for (const name of names) {
      const response = await fetch(`assets/${name}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      const data = buffer.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i += 500) peak = Math.max(peak, Math.abs(data[i]));
      out.push({ name, duration: buffer.duration, sampleRate: buffer.sampleRate, peak });
    }
    return out;
  }, wanted.map((entry) => entry.emitted));
  for (const track of wanted) {
    const found = decoded.find((entry) => entry.name === track.emitted);
    const ok = found && found.duration >= 10 && found.sampleRate >= 8000 && found.peak > 0.005;
    if (!ok) { bad += 1; console.error(`[FAIL] ${track.id}: not playable ${JSON.stringify(found)}`); }
    else console.log(`  ok ${track.id}: decoded ${found.duration.toFixed(1)} s @ ${found.sampleRate} Hz, peak ${found.peak.toFixed(3)} — audible, not silence`);
  }
} finally { await browser.close(); server.close(); }
process.exit(bad ? 1 : 0);
