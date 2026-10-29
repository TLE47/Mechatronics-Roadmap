#!/usr/bin/env node
/**
 * The music tapes (`scripts/build_music.mjs`): four cut from CC0 recordings, four written here.
 *
 * The catalogue (`app/src/audio/musicCatalogue.ts`) names eight tapes in six categories. Two kinds of
 * source feed them, and the script never pretends otherwise:
 *
 * - **Recorded.** Excerpts of four real tracks, all by HoliznaCC0 from the CC0 album *Winter Lofi* on
 *   Free Music Archive. CC0 means public-domain dedication: bundling, cutting and redistributing them
 *   is permitted without attribution, which is what makes shipping them in the app's chunk legal. The
 *   panel still credits the artist, because a learner is entitled to know whose music they hear.
 * - **Composed.** Four tapes this file renders itself: an anime pentatonic bell loop, a pop and a K-pop
 *   four-chord loop, and an instrumental plucked arpeggio. No free recording covers those idioms, and
 *   a synthesised loop labelled honestly as composed is better than a licensed-sounding lie.
 *
 * What the script does to a **recorded** source, and why it is a script rather than a one-off:
 *
 * - **Cut.** A fixed window (past the intro, before the outro) from a fixed start time.
 * - **Fold.** The two seconds after the window are mixed back over its head with an equal-power
 *   crossfade, which is what makes an excerpt loop without a seam. The extra seconds are trimmed.
 * - **Match.** Everything is peak-normalised to `PEAK` after folding, so a tape change is a change of
 *   music, not of level.
 * - **Encode.** AAC. The original two beds stay stereo at 56 kbps; the newer, shorter tapes are mono at
 *   48 kbps (composed: 40 kbps), because eight tapes is where the weight starts to matter and a
 *   background loop does not need a stereo field. `check:weight`'s `music` metric is the ceiling.
 *
 * A **composed** tape needs no source and no network: it is rendered from a seeded synth, folded and
 * encoded the same way, and is byte-identical for the same encoder.
 *
 * The sources are **not** committed: the licence permits redistribution, but 16 MB of MP3 in the
 * repository to derive a few hundred kB of loop is weight nobody needs. `--download` fetches them from
 * the URLs recorded in `RECORDED`; without it the script reads `--source-dir`, and names the missing
 * file rather than silently producing something else.
 *
 * Usage
 *     node scripts/build_music.mjs --download     # fetch the recorded sources, then cut and render all
 *     node scripts/build_music.mjs                # use .cache/music (already downloaded)
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
/** Peak ceiling before the loudness match, so a very peaky cut does not start out clipped. */
const PEAK = 0.8;
/**
 * The common root-mean-square level every tape is matched to (≈ −18.4 dBFS).
 *
 * Peak normalisation alone is not a loudness match: a dense 24-second synth loop and a sparse piano
 * recording can both peak at 0.8 and still differ by 6 dB under the fader, which makes choosing a
 * category sound like choosing a volume. Matching RMS is the part a learner actually hears; the peak
 * is then only a ceiling this never pushes past 1.
 */
const RMS_TARGET = 0.12;

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
 * The recorded tapes, in one place. `start` is where the excerpt begins in the source; `file` is the
 * source's name in the source directory, which is also what `--download` writes.
 *
 * `first-snow`'s FMA page slug really is `first-snowmp3`: the track is titled "First Snow.mp3" in the
 * album. The catalogue shows "First Snow", which is what a learner should see.
 */
export const RECORDED = [
  {
    id: 'lab-night',
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
    channels: 2,
    bitrate: 56000,
  },
  {
    id: 'focus-current',
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
    channels: 2,
    bitrate: 56000,
  },
  {
    id: 'winter-blues',
    file: 'winter-blues.mp3',
    title: 'Winter Blues',
    artist: 'holiznacc0',
    album: 'Winter Lofi',
    licence: 'CC0 1.0 Universal',
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/winter-blues/',
    source:
      'https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/b9aaLxa3HIdDsfDmLDUsR27znNe0aldiVWRJbDF9.mp3',
    seconds: 45,
    /** Past the rubato opening, into the walk. */
    start: 40,
    channels: 1,
    bitrate: 48000,
  },
  {
    id: 'first-snow',
    file: 'first-snow.mp3',
    title: 'First Snow',
    artist: 'holiznacc0',
    album: 'Winter Lofi',
    licence: 'CC0 1.0 Universal',
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/first-snowmp3/',
    source:
      'https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/aNMGi5zWqUxP0qP9De7WJSEV43p0mkZiFrJGuljD.mp3',
    seconds: 40,
    start: 24,
    channels: 1,
    bitrate: 48000,
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

/** Decode a window of the source to interleaved float samples at `SAMPLE_RATE`. */
function decode(source, start, seconds, channels, outPath) {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(start),
      '-t', String(seconds + CROSSFADE),
      '-i', source,
      '-ac', String(channels),
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
 * `samples` is interleaved `channels`-wide audio of `seconds + CROSSFADE`; the result is `seconds`,
 * whose end flows into its own beginning. The peak is normalised on the result, so a loop that folds
 * quieter or louder than its source still lands on `PEAK`.
 */
export function foldLoop(
  samples,
  seconds,
  crossfade = CROSSFADE,
  rate = SAMPLE_RATE,
  channels = 2,
  rmsTarget = RMS_TARGET
) {
  const keep = Math.round(seconds * rate) * channels;
  const fade = Math.round(crossfade * rate) * channels;
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
  if (rmsTarget > 0) {
    let sum = 0;
    for (const sample of folded) sum += sample * sample;
    const rms = Math.sqrt(sum / folded.length);
    const match = rms > 0 ? rmsTarget / rms : 1;
    // The match must not undo the ceiling: a loudness target that clips is worse than a quiet tape.
    let lifted = 0;
    for (const sample of folded) lifted = Math.max(lifted, Math.abs(sample * match));
    const scale = lifted > 1 ? 1 / lifted : match;
    for (let index = 0; index < folded.length; index += 1) folded[index] *= scale;
  }
  return folded;
}

/** A 16-bit WAV, written by hand so half the job needs no dependency. */
function wavBuffer(samples, channels = 2) {
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

function encode(wavPath, outPath, which, channels, bitrate) {
  if (which === 'ffmpeg') {
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', wavPath,
        '-ac', String(channels),
        '-ar', String(SAMPLE_RATE),
        '-c:a', 'aac',
        '-b:a', String(bitrate),
        '-movflags', '+faststart',
        outPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    return;
  }
  execFileSync(
    'afconvert',
    ['-f', 'm4af', '-d', 'aac', '-b', String(bitrate), '-c', String(channels), wavPath, outPath],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

// ---- the composed tapes ---------------------------------------------------------------------
//
// Eight bars of seeded synth is the whole trick. Each idiom is a chord schedule plus a rhythm, and
// every shape below is written to survive `foldLoop`: the tail is the start of the next bar, so the
// seam lands on the downbeat rather than in the middle of a phrase.

const RATE = SAMPLE_RATE;

/** Deterministic noise, so a re-render is the same file rather than a different take. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const sine = (freq, t) => Math.sin(2 * Math.PI * freq * t);
const triangle = (freq, t) => (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t));
const saw = (freq, t) => 2 * (t * freq - Math.floor(t * freq + 0.5));

function emptyBuffer(seconds) {
  return new Float32Array(Math.round((seconds + CROSSFADE) * RATE));
}

/** Mix `voice(t)` into `out` from `at` for `duration` seconds, clipped to the buffer. */
function addVoice(out, at, duration, voice) {
  const start = Math.max(0, Math.round(at * RATE));
  const end = Math.min(out.length, Math.round((at + duration) * RATE));
  for (let index = start; index < end; index += 1) {
    out[index] += voice((index - start) / RATE);
  }
}

/** A plucked string: the fundamental and two quiet partials, decaying together. */
function pluck(out, at, freq, amp, decay = 0.35) {
  addVoice(out, at, decay * 4, (t) => {
    const body = sine(freq, t) * 0.62 + sine(freq * 2.01, t) * 0.26 + sine(freq * 3.02, t) * 0.12;
    return amp * Math.exp(-t / decay) * body * Math.min(1, t / 0.004);
  });
}

/** A bell: the same shape with a long, glassy tail. */
function bell(out, at, freq, amp) {
  addVoice(out, at, 2.2, (t) => {
    const body = sine(freq, t) * 0.55 + sine(freq * 2.76, t) * 0.2 + sine(freq * 5.4, t) * 0.08;
    return amp * Math.exp(-t / 0.75) * body * Math.min(1, t / 0.006);
  });
}

/** A held chord: three detuned saws through a one-pole low-pass, with a slow attack and release. */
function padChord(out, at, duration, notes, amp) {
  const release = 0.25;
  const total = duration + release;
  const lows = notes.map(() => 0);
  addVoice(out, at, total, (t) => {
    const attack = Math.min(1, t / 0.18);
    const tail = t > duration ? Math.max(0, 1 - (t - duration) / release) : 1;
    let sum = 0;
    notes.forEach((note, index) => {
      const freq = hz(note);
      const raw = (saw(freq, t) + saw(freq * 1.003, t) + saw(freq * 0.997, t)) / 3;
      // One-pole low-pass at roughly 900 Hz: a pad, not a buzz.
      lows[index] += 0.12 * (raw - lows[index]);
      sum += lows[index];
    });
    return amp * attack * tail * sum;
  });
}

/** A bass note: triangle, short attack, released before the next beat. */
function bassNote(out, at, duration, note, amp) {
  addVoice(out, at, duration + 0.03, (t) => {
    const attack = Math.min(1, t / 0.01);
    const tail = t > duration ? Math.max(0, 1 - (t - duration) / 0.03) : 1;
    return amp * attack * tail * triangle(hz(note), t);
  });
}

/** A kick: pitch falls from 120 Hz to 45 Hz in 30 ms, then decays. */
function kick(out, at, amp = 0.7) {
  addVoice(out, at, 0.3, (t) => {
    const freq = 45 + 75 * Math.exp(-t / 0.03);
    return amp * Math.exp(-t / 0.1) * sine(freq, t);
  });
}

/** A hat: noise through a one-sample difference (a cheap high-pass), 20 ms. */
function hat(out, at, amp, rng) {
  let previous = 0;
  addVoice(out, at, 0.06, (t) => {
    const noise = rng() * 2 - 1;
    const bright = noise - previous;
    previous = noise;
    return amp * Math.exp(-t / 0.018) * bright;
  });
}

/** A clap: three noise bursts 12 ms apart, so it reads as hands rather than a snare. */
function clap(out, at, amp, rng) {
  for (const [offset, level] of [[0, 0.5], [0.012, 0.7], [0.024, 1]]) {
    let previous = 0;
    addVoice(out, at + offset, 0.12, (t) => {
      const noise = rng() * 2 - 1;
      const band = 0.5 * (noise + previous);
      previous = noise;
      return amp * level * Math.exp(-t / 0.045) * band;
    });
  }
}

/** The room: a very quiet filtered noise floor under an arpeggio. */
function roomTone(out, seconds, amp, rng) {
  let previous = 0;
  addVoice(out, 0, seconds + CROSSFADE, (t) => {
    const noise = rng() * 2 - 1;
    previous += 0.02 * (noise - previous);
    return amp * previous * Math.min(1, t / 0.5);
  });
}

/** The four-bar chord schedules. MIDI notes, root first. */
const ARPEGGIO_CHORDS = [
  [52, 55, 59, 64], // Em
  [48, 52, 55, 60], // C
  [55, 59, 62, 67], // G
  [50, 54, 57, 62], // D
];
const ANIME_CHORDS = [
  [45, 52, 57, 60], // Am
  [41, 48, 53, 57], // F
  [48, 52, 55, 60], // C
  [43, 50, 55, 59], // G
];
const POP_CHORDS = [
  [48, 52, 55, 60], // C
  [43, 47, 50, 55], // G
  [45, 48, 52, 57], // Am
  [41, 45, 48, 53], // F
];
const KPOP_CHORDS = [
  [45, 52, 57, 60], // Am
  [41, 48, 53, 57], // F
  [48, 52, 55, 60], // C
  [43, 50, 55, 59], // G
];

/** An instrumental arpeggio: Em–C–G–D at 80 bpm, eighth notes, no drums. */
function renderArpeggio(seconds, seed) {
  const out = emptyBuffer(seconds);
  const rng = mulberry32(seed);
  const beat = 60 / 80;
  const bar = beat * 4;
  const bars = Math.round(seconds / bar);
  roomTone(out, seconds, 0.02, rng);
  for (let index = 0; index < bars; index += 1) {
    const at = index * bar;
    const chord = ARPEGGIO_CHORDS[index % ARPEGGIO_CHORDS.length];
    padChord(out, at, bar * 0.95, chord.slice(0, 3).map((note) => note + 12), 0.09);
    const order = [0, 1, 2, 3, 2, 1, 3, 2];
    order.forEach((tone, step) => {
      const note = chord[tone] + (step === 7 ? 12 : 0);
      pluck(out, at + step * (beat / 2), hz(note), step === 0 ? 0.34 : 0.24, 0.42);
    });
  }
  return out;
}

/** Anime: an Am pentatonic bell melody over a soft drone, 80 bpm, 8 bars. */
function renderAnime(seconds, seed) {
  const out = emptyBuffer(seconds);
  const rng = mulberry32(seed);
  const beat = 60 / 80;
  const bar = beat * 4;
  const bars = Math.round(seconds / bar);
  // Degrees into A minor pentatonic, one entry per eighth note, with a rest-free but breathing shape.
  const motif = [0, 3, 2, 4, 2, 3, 1, 0, 2, 4, 5, 4, 2, 3, 1, -1];
  const scale = [69, 72, 74, 76, 79, 81];
  for (let index = 0; index < bars; index += 1) {
    const at = index * bar;
    const chord = ANIME_CHORDS[index % ANIME_CHORDS.length];
    padChord(out, at, bar * 0.98, [chord[0] - 12, chord[0]], 0.1);
    for (let step = 0; step < 16; step += 1) {
      const t = at + step * (beat / 4);
      const degree = motif[(step + index * 3) % motif.length];
      if (degree >= 0 && step % 2 === 0) {
        bell(out, t, hz(scale[degree] + (index % 2 === 1 ? 7 : 0)), 0.16);
      }
      if (step === 0 || step === 10) kick(out, t, 0.42);
      if (step === 4 || step === 12) clap(out, t, 0.14, rng);
      if (step % 4 === 2) hat(out, t, 0.05, rng);
    }
  }
  return out;
}

/** Pop: C–G–Am–F at 120 bpm, four-on-the-floor, a filtered pad and an offbeat pluck. */
function renderPop(seconds, seed) {
  return renderFourChord(seconds, seed, { chords: POP_CHORDS, bpm: 120, arp: false, clapLevel: 0.24 });
}

/** K-pop: Am–F–C–G at 120 bpm, brighter: sixteenth plucks, side-chained pad, claps on two and four. */
function renderKpop(seconds, seed) {
  return renderFourChord(seconds, seed, { chords: KPOP_CHORDS, bpm: 120, arp: true, clapLevel: 0.3 });
}

function renderFourChord(seconds, seed, { chords, bpm, arp, clapLevel }) {
  const out = emptyBuffer(seconds);
  const rng = mulberry32(seed);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = Math.round(seconds / bar);
  for (let index = 0; index < bars; index += 1) {
    const at = index * bar;
    const chord = chords[index % chords.length];
    padChord(out, at, bar * 0.98, chord, arp ? 0.1 : 0.12);
    for (let step = 0; step < 16; step += 1) {
      const t = at + step * (beat / 4);
      if (step % 4 === 0) kick(out, t, 0.62);
      if (step === 4 || step === 12) clap(out, t, clapLevel, rng);
      if (step % 2 === 0) hat(out, t + 0.012, 0.06, rng);
      if (arp && step % 2 === 1) pluck(out, t, hz(chord[(step >> 1) % 4] + 12), 0.16, 0.16);
      if (step % 4 === 2) bassNote(out, t, beat * 0.35, chord[0] - 24, 0.34);
      if (!arp && step === 14) pluck(out, t, hz(chord[3] + 12), 0.12, 0.25);
    }
  }
  return out;
}

/**
 * The composed tapes. `render` is the idiom; `seconds` and the tempo are chosen so the loop is a whole
 * number of four-bar phrases, which is what lets the folded seam land on a downbeat.
 */
export const COMPOSED = [
  { id: 'bench-arpeggio', title: 'Bench Arpeggio', seconds: 24, seed: 0xa91e, bitrate: 40000, render: renderArpeggio },
  { id: 'paper-lanterns', title: 'Paper Lanterns', seconds: 24, seed: 0x51c7, bitrate: 40000, render: renderAnime },
  { id: 'city-lights', title: 'City Lights', seconds: 24, seed: 0x2c03, bitrate: 40000, render: renderPop },
  { id: 'neon-stage', title: 'Neon Stage', seconds: 24, seed: 0x7d19, bitrate: 40000, render: renderKpop },
];

async function download(track, dir) {
  const target = path.join(dir, track.file);
  if (fs.existsSync(target) && fs.statSync(target).size > 100000) return target;
  const response = await fetch(track.source, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${track.id}: download failed (${response.status}) from ${track.source}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100000) throw new Error(`${track.id}: the download is only ${bytes.length} B`);
  fs.writeFileSync(target, bytes);
  return target;
}

/** Re-cut a file and compare it with what is committed: the same cut, within encoder variance. */
function compare(target, committed) {
  if (!fs.existsSync(committed)) {
    console.error(`build_music: ${path.relative(ROOT, committed)} is missing; run this script`);
    return false;
  }
  const fresh = fs.statSync(target).size;
  const size = fs.statSync(committed).size;
  // Encoders are not byte-stable across versions; the tolerance is about "this is the same cut",
  // which the fixed window and the rendered score can prove.
  if (Math.abs(fresh - size) / size > 0.02) {
    console.error(`build_music: ${path.basename(committed)} is ${size} B committed but re-cuts to ${fresh} B; regenerate it`);
    return false;
  }
  console.log(`  ok ${path.basename(committed)}: ${size} B, still what this script makes`);
  return true;
}

function write(target, wavPath, which, channels, bitrate, seconds) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  encode(wavPath, target, which, channels, bitrate);
  const size = fs.statSync(target).size;
  console.log(
    `wrote ${path.relative(ROOT, target)} — ${seconds}s ${channels === 1 ? 'mono' : 'stereo'} AAC ` +
      `${bitrate / 1000} kbps, ${size} B`
  );
}

async function main() {
  const missing = [];
  // `--download` writes here, and a plain run reads it. `--check` needs the same sources: without
  // them it cannot say whether the committed cuts are current, so it fails rather than passing on
  // nothing.
  const sourceDir = path.resolve(arg('--source-dir', path.join(ROOT, '.cache', 'music')));

  if (DRY_RUN) {
    for (const track of RECORDED) {
      console.log(
        `would cut ${track.seconds}s of ${track.title} (${track.artist}) from ${track.start}s to ` +
          `${path.relative(ROOT, path.join(OUTPUT_DIR, `${track.id}.m4a`))}`
      );
    }
    for (const tape of COMPOSED) {
      console.log(`would render ${tape.seconds}s of ${tape.title} to ${path.relative(ROOT, path.join(OUTPUT_DIR, `${tape.id}.m4a`))}`);
    }
    return;
  }

  const which = encoder();
  if (!which) {
    console.error('build_music: needs ffmpeg or afconvert on PATH to cut and encode the tapes');
    process.exit(2);
  }
  fs.mkdirSync(sourceDir, { recursive: true });

  let failed = false;
  for (const track of RECORDED) {
    let source;
    if (DOWNLOAD) {
      source = await download(track, sourceDir);
    } else {
      source = path.join(sourceDir, track.file);
      if (!fs.existsSync(source)) {
        missing.push(`${track.file} (${track.id})`);
        continue;
      }
    }

    const work = fs.mkdtempSync(path.join(os.tmpdir(), `mechalab-${track.id}-`));
    const raw = path.join(work, 'window.f32');
    const wav = path.join(work, 'loop.wav');
    const target = CHECK ? path.join(work, `${track.id}.m4a`) : path.join(OUTPUT_DIR, `${track.id}.m4a`);
    try {
      const samples = decode(source, track.start, track.seconds, track.channels, raw);
      fs.writeFileSync(wav, wavBuffer(foldLoop(samples, track.seconds, CROSSFADE, SAMPLE_RATE, track.channels), track.channels));
      if (CHECK) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        encode(wav, target, which, track.channels, track.bitrate);
        if (!compare(target, path.join(OUTPUT_DIR, `${track.id}.m4a`))) failed = true;
      } else {
        write(target, wav, which, track.channels, track.bitrate, track.seconds);
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

  // The composed tapes need neither a source nor a network: render, fold, encode, compare.
  for (const tape of COMPOSED) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), `mechalab-${tape.id}-`));
    const wav = path.join(work, 'loop.wav');
    const target = CHECK ? path.join(work, `${tape.id}.m4a`) : path.join(OUTPUT_DIR, `${tape.id}.m4a`);
    try {
      // `foldLoop` does the loudness match, so a dense 24-second loop and a sparse recording sit at
      // the same level under the fader.
      const folded = foldLoop(tape.render(tape.seconds, tape.seed), tape.seconds, CROSSFADE, SAMPLE_RATE, 1);
      fs.writeFileSync(wav, wavBuffer(folded, 1));
      if (CHECK) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        encode(wav, target, which, 1, tape.bitrate);
        if (!compare(target, path.join(OUTPUT_DIR, `${tape.id}.m4a`))) failed = true;
      } else {
        write(target, wav, which, 1, tape.bitrate, tape.seconds);
      }
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  if (CHECK) {
    if (failed) process.exit(1);
    console.log(`[PASS] music: ${RECORDED.length + COMPOSED.length} tapes are what this script makes`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[FAIL] build_music: ${error.message}`);
    process.exit(2);
  });
}
