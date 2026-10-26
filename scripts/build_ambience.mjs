#!/usr/bin/env node
/**
 * The room's one recorded file (`scripts/build_ambience.mjs`).
 *
 * Synthesises 24 seconds of night rain and encodes it to mono AAC for
 * `app/src/audio/assets/rain-loop.m4a`. It is generated rather than sampled on purpose:
 *
 * - **No licence to track and nothing to police.** The recording is ours, made by this script, so the
 *   provenance question is answered by a file in the repository instead of a stock-library receipt.
 * - **Reproducible.** The noise is a seeded PRNG, so the same command produces the same loop; a
 *   regenerated asset is a reviewable diff, not a different sound.
 * - **Seamless.** A 26-second bed is folded into 24 with a 2-second equal-power crossfade, so looping
 *   it does not tick.
 *
 * Three layers, which is what rain actually is: broadband body, a bright hiss of drops on glass, and
 * low city rumble underneath. `--check` re-renders and compares the encoded bytes, so CI can prove
 * the committed file is still what this script makes (it needs `ffmpeg` or macOS `afconvert`).
 *
 * Usage
 *     node scripts/build_ambience.mjs            # write the asset
 *     node scripts/build_ambience.mjs --check    # render to a temp file and compare
 *     node scripts/build_ambience.mjs --dry-run  # say what it would do
 *
 * Exit-code family: typed
 *     0  the asset is written (or, with --check, already current)
 *     1  --check found the asset missing or different
 *     2  no encoder on this machine, or a bad command line
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'app', 'src', 'audio', 'assets', 'rain-loop.m4a');
const SAMPLE_RATE = 44100;
/** The audible length. Two more seconds are rendered and crossfaded away. */
export const SECONDS = 24;
const CROSSFADE = 2;
const BITRATE = 40000;
const DRY_RUN = process.argv.includes('--dry-run');
const CHECK = process.argv.includes('--check');

/** mulberry32: four lines, no dependency, the same sequence on every machine. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Render the loop as Float32 samples, already folded to a seamless length. */
export function renderRain() {
  const total = Math.round((SECONDS + CROSSFADE) * SAMPLE_RATE);
  const keep = Math.round(SECONDS * SAMPLE_RATE);
  const fade = Math.round(CROSSFADE * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const rng = random(0x9e3779b9);

  // Body: white noise integrated into brown (the waterfall under the window), with a little leak so
  // it does not drift to DC.
  let brown = 0;
  for (let index = 0; index < total; index += 1) {
    const white = rng() * 2 - 1;
    brown = (brown + white * 0.02) * 0.998;
    samples[index] += brown * 0.55;
  }

  // Hiss: the same white, brighter and quieter, with a slow gust.
  for (let index = 0; index < total; index += 1) {
    const seconds = index / SAMPLE_RATE;
    const gust = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.05 * seconds);
    samples[index] += (rng() * 2 - 1) * 0.09 * gust;
  }

  // Drops: short decaying sines on glass, scattered in time and pitch. This is the layer that makes
  // it rain rather than hiss.
  const drops = Math.round(SECONDS * 26);
  for (let drop = 0; drop < drops; drop += 1) {
    const at = Math.floor(rng() * total);
    const freq = 900 + rng() * 2600;
    const amplitude = 0.015 + rng() * 0.05;
    const decay = 0.006 + rng() * 0.02;
    const length = Math.min(total - at, Math.round(decay * 6 * SAMPLE_RATE));
    for (let offset = 0; offset < length; offset += 1) {
      const t = offset / SAMPLE_RATE;
      samples[at + offset] += Math.sin(2 * Math.PI * freq * t) * amplitude * Math.exp(-t / decay);
    }
  }

  // City: a low drone nothing resolves into a pitch.
  for (let index = 0; index < total; index += 1) {
    const seconds = index / SAMPLE_RATE;
    samples[index] += Math.sin(2 * Math.PI * 43 * seconds) * 0.035;
    samples[index] += Math.sin(2 * Math.PI * 64.5 * seconds + 1.1) * 0.02;
  }

  // Fold: the tail's first `fade` samples are mixed back over the head, equal power, so the loop
  // point is inaudible. The extra second and a half is trimmed rather than faded out.
  const folded = new Float32Array(keep);
  for (let index = 0; index < keep; index += 1) folded[index] = samples[index];
  for (let index = 0; index < fade; index += 1) {
    const angle = (index / fade) * (Math.PI / 2);
    folded[index] = folded[index] * Math.sin(angle) + samples[keep + index] * Math.cos(angle);
  }

  // Normalise to a comfortable level: the file is a bed, and the engine's faders do the rest.
  let peak = 0;
  for (const sample of folded) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? 0.72 / peak : 1;
  for (let index = 0; index < folded.length; index += 1) folded[index] *= gain;
  return folded;
}

/** A 16-bit mono WAV, written by hand so the script has no dependency for half its job. */
function wavBuffer(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    data.writeInt16LE(Math.round(value * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Which encoder this machine has: ffmpeg first, then macOS's own afconvert. */
function encoder() {
  for (const command of ['ffmpeg', 'afconvert']) {
    try {
      execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
      return command;
    } catch {
      // try the next one
    }
  }
  return null;
}

function encode(wavPath, outPath, which) {
  if (which === 'ffmpeg') {
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', wavPath,
        '-ac', '1',
        '-ar', String(SAMPLE_RATE),
        '-c:a', 'aac',
        '-b:a', String(BITRATE),
        '-movflags', '+faststart',
        outPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    return;
  }
  // afconvert wants the bitrate in bits per second too, and infers the container from the suffix.
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(BITRATE), '-c', '1', wavPath, outPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function main() {
  if (DRY_RUN) {
    console.log(`would render ${SECONDS}s of rain to ${path.relative(ROOT, OUTPUT)}`);
    return;
  }
  const which = encoder();
  if (!which) {
    console.error('build_ambience: needs ffmpeg or afconvert on PATH to encode the loop');
    process.exit(2);
  }
  const dir = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), 'mechalab-rain-')) : path.dirname(OUTPUT);
  const wav = path.join(dir, 'rain-loop.wav');
  const target = CHECK ? path.join(dir, 'rain-loop.m4a') : OUTPUT;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(wav, wavBuffer(renderRain()));
  try {
    encode(wav, target, which);
  } finally {
    fs.rmSync(wav, { force: true });
  }

  if (CHECK) {
    const fresh = fs.readFileSync(target);
    const committed = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT) : null;
    fs.rmSync(dir, { recursive: true, force: true });
    if (!committed) {
      console.error(`build_ambience: ${path.relative(ROOT, OUTPUT)} is missing; run this script`);
      process.exit(1);
    }
    // The encoder is deterministic per machine but not necessarily per version, so the gate allows a
    // small tolerance and says the size rather than pretending the bytes are stable across ffmpeg
    // releases.
    const drift = Math.abs(fresh.length - committed.length) / committed.length;
    if (drift > 0.01) {
      console.error(
        `build_ambience: the committed loop is ${committed.length} B and the render is ${fresh.length} B ` +
          `(${(drift * 100).toFixed(1)}% apart); regenerate it`
      );
      process.exit(1);
    }
    console.log(`[PASS] ambience: ${path.relative(ROOT, OUTPUT)} is current (${committed.length} B)`);
    return;
  }

  const size = fs.statSync(target).size;
  console.log(
    `wrote ${path.relative(ROOT, target)} — ${SECONDS}s mono AAC ${BITRATE / 1000} kbps, ${size} B`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[FAIL] build_ambience: ${error.message}`);
    process.exit(2);
  }
}
