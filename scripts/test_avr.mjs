#!/usr/bin/env node
/**
 * The committed firmware prints what the lesson says (`scripts/test_avr.mjs`).
 *
 * The Board tab runs machine code, not a Python model of the sketch, so the claim worth gating is that
 * the bytes in `app/public/firmware/` — compiled once, by `--write-firmware` — actually print the serial
 * each page promises when executed on an emulated Uno. This suite runs them through `app/src/avrSim.ts`,
 * the same module the tab imports, and compares with the text `boardBridges.json` carries (which is the
 * lesson's own `### Expected Output`, proven by `--host-verify` against the C++).
 *
 * That is also what makes the cheaper gate sufficient: `--check-firmware` proves the hex was built from
 * the sketch text the page still ships, and this proves that hex behaves. Neither needs arduino-cli, so
 * both run in CI's verify step; a rebuild would differ byte-for-byte on a newer toolchain while printing
 * the same thing.
 *
 * Run: node --experimental-strip-types scripts/test_avr.mjs (`npm run test:avr`)
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compareStdout } from '../app/src/outputMatch.ts';
import {
  AVR_FREQ_HZ,
  FLASH_WORDS,
  DEFAULT_MAX_CYCLES,
  AvrSketch,
  normalizeSerial,
  parseIntelHex,
  runSketch,
} from '../app/src/avrSim.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const root = process.cwd();
const bridges = JSON.parse(fs.readFileSync(path.join(root, 'app/src/data/boardBridges.json'), 'utf8')).bridges;
const firmware = JSON.parse(fs.readFileSync(path.join(root, 'app/src/data/firmware.json'), 'utf8'));
const byId = new Map(firmware.sketches.map((entry) => [entry.id, entry]));
const readHex = (entry) => fs.readFileSync(path.join(root, 'app/public', entry.hex), 'utf8');

console.log('avr');

check('every lesson has firmware, and every firmware has a lesson', () => {
  assert.equal(firmware.fqbn, 'arduino:avr:uno', 'the board the lessons target');
  assert.equal(byId.size, bridges.length, 'one compiled sketch per lesson card');
  for (const bridge of bridges) {
    assert.ok(byId.has(bridge.id), `${bridge.id} has no compiled sketch, so the tab cannot run it`);
  }
});

check('the hex on disk is the file the index hashed', () => {
  for (const entry of firmware.sketches) {
    const hex = readHex(entry);
    const digest = crypto.createHash('sha256').update(hex, 'utf8').digest('hex');
    assert.equal(digest, entry.hexSha256, `${entry.hex} was edited after it was built; rebuild with --write-firmware`);
    assert.ok(hex.length > 1000, `${entry.hex} is ${hex.length} bytes, too small to be a program`);
  }
});

check('the clock and flash match an ATmega328P', () => {
  assert.equal(AVR_FREQ_HZ, 16_000_000, 'the Uno runs at 16 MHz');
  assert.equal(FLASH_WORDS, 16384, '32 kB of flash is 16384 instruction words');
  assert.ok(DEFAULT_MAX_CYCLES >= 8_000_000, 'the budget must cover the longest delay() in the lessons');
});

for (const bridge of bridges) {
  check(`${bridge.id}: the compiled sketch prints the lesson's serial`, () => {
    const entry = byId.get(bridge.id);
    const run = runSketch(readHex(entry), { expected: bridge.expectedOutput });
    assert.equal(
      run.status,
      'complete',
      `expected the sketch to finish inside ${DEFAULT_MAX_CYCLES} cycles; it printed ${JSON.stringify(run.serial.slice(0, 120))}`
    );
    const comparison = compareStdout(run.serial, bridge.expectedOutput, 'normalized');
    assert.equal(comparison.matched, true, `serial differs at line ${comparison.firstDiffLine}`);
  });
}

check('the serial is LF-normalised, not the USART CRLF', () => {
  const entry = byId.get(bridges[0].id);
  const run = runSketch(readHex(entry), { expected: bridges[0].expectedOutput });
  assert.ok(!run.serial.includes('\r'), 'the reported serial must have its carriage returns normalised');
  assert.equal(normalizeSerial('a\r\nb\rc\n'), 'a\nb\nc\n');
});

check('a wrong expectation runs to the budget instead of claiming success', () => {
  const entry = byId.get(bridges[0].id);
  const run = runSketch(readHex(entry), {
    expected: 'this is not the serial this sketch prints, so the run must not stop early',
  });
  assert.equal(run.status, 'budget', 'a run that never matches must exhaust the cycle budget');
});

check('a corrupted record is refused by its checksum, not run', () => {
  const entry = byId.get(bridges[0].id);
  const lines = readHex(entry).split('\n');
  // Flip one nibble of the first data record: the checksum is now wrong.
  const broken = [lines[0].replace(/:10/, ':11'), ...lines.slice(1)].join('\n');
  assert.throws(() => parseIntelHex(broken), /checksum/, 'a hand-edited hex must not load silently');
});

check('a file with no end record is refused', () => {
  const entry = byId.get(bridges[0].id);
  const text = readHex(entry)
    .split('\n')
    .filter((line) => !line.startsWith(':00000001'))
    .join('\n');
  assert.throws(() => parseIntelHex(text), /end-of-file/, 'a truncated hex must not load');
});

check('a line that is not Intel HEX is refused with its line number', () => {
  assert.throws(() => parseIntelHex('hello\n'), /line 1/, 'a non-hex file must name the offending line');
});

check('stepping is chunked: the same program can be run a slice at a time', () => {
  const entry = byId.get(bridges[0].id);
  const sketch = new AvrSketch(readHex(entry));
  sketch.step(20_000);
  const early = sketch.cycles;
  sketch.step(20_000);
  assert.equal(sketch.cycles, early + 20_000, 'each step must add exactly the cycles it ran');
  assert.ok(sketch.output.length >= 0, 'a partial run has readable output');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
