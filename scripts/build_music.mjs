#!/usr/bin/env node
/**
 * The two music beds (`scripts/build_music.mjs`), cut from CC0 sources.
 *
 * Unlike the rain loop, these are **not** synthesised: they are excerpts of two real lo-fi tracks,
 * both released under CC0 1.0 Universal (public domain dedication) on Free Music Archive. The plan's
 * "named music beds" — Lab Night at home, Focus Current in focus mode — are these two files, and the
 * engine's synthesised drones stay in the code as the fallback for a browser that cannot decode AAC.
 *
 * What this script does, and why it is a script rather than a one-off:
 *
 * - **Cut.** A 60-second window from a composed track (past the intro, before the outro) is taken at a
 *   fixed start time, so the cut is the same every time it is repeated.
 * - **Fold.** The two seconds after the window are mixed back over its head with an equal-power
 *   crossfade, which is what makes a 60-second excerpt loop without a seam. The extra two seconds are
 *   trimmed rather than faded out.
 * - **Match.** Both beds are peak-normalised to the same level, so switching scene does not jump.
 * - **Encode.** Stereo AAC at 56 kbps — a background bed that is ducked during a run and quieter again
 *   in focus, measured at its own weight by `check:weight`'s `music` metric.
 *
 * The sources are **not** committed: the licence permits redistribution, but a 7 MB MP3 in the
 * repository to derive a 450 kB loop is weight nobody needs. `--download` fetches them from the URLs
 * recorded in `BEDS` (and in `app/src/audio/musicBeds.ts` and the NOTICE beside the files); without it
 * the script cuts from whatever `--source-dir` holds, and says which file is missing rather than
 * silently producing something else.
 *
 * Usage
 *     node scripts/build_music.mjs --download     # fetch the two sources, then cut both loops
 *     node scripts/build_music.mjs                # cut from .cache/music (already downloaded)
 *     node scripts/build_music.mjs --check        # re-cut and compare with what is committed
 *     node scripts/build_music.mjs --dry-run      # say what it would write
 *
 * Exit-code family: typed
 *     0  the loops are written (or, with --check, already current)
 *     1  --check found a loop missing or different
 *     2  no encoder on this machine, a source missing, a download failed, or a bad command line
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'app', 'src', 'audio', 'assets', 'music');
const SAMPLE_RATE = 44100;
const CROSSFADE = 2;
/** Peak every bed is normalised to, so a scene change is a change of music, not of level. */
const PEAK = 0.8;
const BITRATE = 56000;

const DRY_RUN = process.argv.includes('--dry-run');
const CHECK = process.argv.includes('--check');
const DOWNLOAD = process.argv.includes('--download');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a directory`);
  return value;
}

/**
 * The beds, in one place. `start` is where the excerpt begins in the source; `file` is the source's
 * name in the source directory, which is also what `--download` writes.
 */
export const BEDS = [
  {
    id: 'lab-night',
    scene: 'home',
    file: 'snow-drift.mp3',
    title: 'Snow Drift',
    artist: 'holiznacc0',
    album: 'Winter Lofi',
    licence: 'CC0 1.0 Universal',
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/snow-drift/',
    source:
      'https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/K0WPofXI9S27E24ORSKxrYhlyFe2g7zldVkmR6KF.mp3',
    seconds: 60,
    /** Past the intro, in the steady groove the track settles into. */
    start: 42,
  },
  {
    id: 'focus-current',
    scene: 'focus',
    file: 'fire-place.mp3',
    title: 'Fire Place',
    artist: 'holiznacc0',
    album: 'Winter Lofi',
    licence: 'CC0 1.0 Universal',
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/fire-place/',
    source:
      'https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/qUQGTyL3bMTaIVqsuZ3dUS2u2ep2ZmVr86sWwZ0j.mp3',
    seconds: 60,
    start: 36,
  },
];

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

/** Decode a window of the source to interleaved stereo float samples at `SAMPLE_RATE`. */
function decode(source, start, seconds, outPath) {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(start),
      '-t', String(seconds + CROSSFADE),
      '-i', source,
      '-ac', '2',
      '-ar', String(SAMPLE_RATE),
      '-f', 'f32le',
      outPath,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  // Copied out of the Buffer's pooled allocation: `buf.buffer` can hold other files' bytes, and a
  // view without the right byte offset would decode somebody else's memory as audio.
  const raw = fs.readFileSync(outPath);
  const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  return new Float32Array(bytes);
}

/**
 * Fold the tail over the head, equal power, in place.
 *
 * `samples` is interleaved stereo of `seconds + CROSSFADE`; the result is `seconds`, whose end flows
 * into its own beginning.
 */
export function foldLoop(samples, seconds, crossfade = CROSSFADE, rate = SAMPLE_RATE) {
  const keep = Math.round(seconds * rate) * 2;
  const fade = Math.round(crossfade * rate) * 2;
  const folded = new Float32Array(keep);
  folded.set(samples.subarray(0, keep));
  for (let index = 0; index < fade; index += 1) {
    const angle = (index / fade) * (Math.PI / 2);
    folded[index] = folded[index] * Math.sin(angle) + samples[keep + index] * Math.cos(angle);
  }
  let peak = 0;
  for (const sample of folded) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? PEAK / peak : 1;
  for (let index = 0; index < folded.length; index += 1) folded[index] *= gain;
  return folded;
}

/** A 16-bit stereo WAV, written by hand so half the job needs no dependency. */
function wavBuffer(samples) {
  const channels = 2;
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
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function encode(wavPath, outPath, which) {
  if (which === 'ffmpeg') {
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', wavPath,
        '-ac', '2',
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
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(BITRATE), '-c', '2', wavPath, outPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

async function download(bed, dir) {
  const target = path.join(dir, bed.file);
  if (fs.existsSync(target) && fs.statSync(target).size > 100000) return target;
  const response = await fetch(bed.source, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${bed.id}: download failed (${response.status}) from ${bed.source}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100000) throw new Error(`${bed.id}: the download is only ${bytes.length} B`);
  fs.writeFileSync(target, bytes);
  return target;
}

async function main() {
  const missing = [];
  // `--download` writes here, and a plain run reads it. `--check` needs the same sources: without
  // them it cannot say whether the committed loops are current, so it fails rather than passing on
  // nothing.
  const sourceDir = path.resolve(arg('--source-dir', path.join(ROOT, '.cache', 'music')));

  if (DRY_RUN) {
    for (const bed of BEDS) {
      console.log(
        `would cut ${bed.seconds}s of ${bed.title} (${bed.artist}) from ${bed.start}s to ` +
          `${path.relative(ROOT, path.join(OUTPUT_DIR, `${bed.id}.m4a`))}`
      );
    }
    return;
  }

  const which = encoder();
  if (!which) {
    console.error('build_music: needs ffmpeg or afconvert on PATH to cut and encode the beds');
    process.exit(2);
  }
  fs.mkdirSync(sourceDir, { recursive: true });

  let failed = false;
  for (const bed of BEDS) {
    let source;
    if (DOWNLOAD) {
      source = await download(bed, sourceDir);
    } else {
      source = path.join(sourceDir, bed.file);
      if (!fs.existsSync(source)) {
        missing.push(`${bed.file} (${bed.id})`);
        continue;
      }
    }

    const work = fs.mkdtempSync(path.join(os.tmpdir(), `mechalab-${bed.id}-`));
    const raw = path.join(work, 'window.f32');
    const wav = path.join(work, 'loop.wav');
    const target = CHECK ? path.join(work, `${bed.id}.m4a`) : path.join(OUTPUT_DIR, `${bed.id}.m4a`);
    try {
      const samples = decode(source, bed.start, bed.seconds, raw);
      fs.writeFileSync(wav, wavBuffer(foldLoop(samples, bed.seconds)));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      encode(wav, target, which);

      if (CHECK) {
        const committed = path.join(OUTPUT_DIR, `${bed.id}.m4a`);
        const fresh = fs.statSync(target).size;
        if (!fs.existsSync(committed)) {
          console.error(`build_music: ${path.relative(ROOT, committed)} is missing; run this script`);
          failed = true;
          continue;
        }
        const size = fs.statSync(committed).size;
        // Encoders are not byte-stable across versions; the tolerance is about "this is the same
        // cut", which is what the sizes and the fixed window can prove.
        if (Math.abs(fresh - size) / size > 0.02) {
          console.error(`build_music: ${bed.id} is ${size} B committed but re-cuts to ${fresh} B; regenerate it`);
          failed = true;
          continue;
        }
        console.log(`  ok ${bed.id}: ${size} B, still what this script cuts`);
      } else {
        console.log(
          `wrote ${path.relative(ROOT, target)} — ${bed.seconds}s stereo AAC ${BITRATE / 1000} kbps, ` +
            `${fs.statSync(target).size} B`
        );
      }
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  if (missing.length) {
    console.error(
      `build_music: missing source(s) ${missing.join(', ')} in ${path.relative(ROOT, sourceDir)} — ` +
        'run with --download, or point --source-dir at a copy'
    );
    process.exit(2);
  }
  if (CHECK) {
    if (failed) process.exit(1);
    console.log('[PASS] music: both beds are what this script cuts');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[FAIL] build_music: ${error.message}`);
    process.exit(2);
  });
}
