/**
 * The AVR the Board tab runs (`app/src/avrSim.ts`).
 *
 * The five Arduino lessons ship *compiled* machine code: `scripts/extract_and_compile_sketches.py
 * --write-firmware` builds each `Full Solution` for `arduino:avr:uno` and commits the `.hex`, and this
 * module executes it in `avr8js` — the same emulator core Wokwi runs — with the peripherals the
 * lessons use: the three timers (Timer0 is `millis()` and therefore `delay()`), the USART that `Serial`
 * writes to, and the three I/O ports whose register writes must not read as "unimplemented".
 *
 * Two honest limits, both written down rather than papered over:
 *
 *  - **An edit cannot be run.** What executes is the compiled reference; a learner who changes the
 *    sketch runs it on a board or in CI. That is the same boundary the page's own build has.
 *  - **Unconnected inputs read 0.** No ADC is attached, exactly like the host mock CI compiles against
 *    (`scripts/extract_and_compile_sketches.py`), which is why a lesson's expected serial is the text
 *    this emulator prints. A real board with a floating pin differs in the numbers, not in the code.
 *
 * Nothing here touches the DOM or React: the Node suite (`scripts/test_avr.mjs`) runs the same
 * functions the tab does, so "the committed firmware prints the lesson's serial" is a fact a gate
 * checks, not a claim the UI makes.
 */

import {
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js';
import { compareStdout } from './outputMatch.ts';

/** The Uno's clock. The USART's baud maths and the timers both need it. */
export const AVR_FREQ_HZ = 16_000_000;
/** ATmega328P flash, in 16-bit words (32 kB). */
export const FLASH_WORDS = 16 * 1024;
/** ~0.75 s of simulated time: every lesson finishes printing well inside it. */
export const DEFAULT_MAX_CYCLES = 12_000_000;
/** How many instructions the tab runs per animation frame; small enough to stay responsive. */
export const CHUNK_CYCLES = 40_000;

/**
 * Parse an Intel HEX file into the CPU's program words.
 *
 * The checksum is verified rather than skipped: a hex file edited by hand or truncated by a bad copy
 * would otherwise run as a program that quietly does something else, and the failure would surface as
 * a confusing serial diff instead of "record 41 is corrupt".
 */
export function parseIntelHex(text: string, words: number = FLASH_WORDS): Uint16Array {
  const program = new Uint16Array(words);
  const lines = text.split(/\r?\n/);
  let sawEnd = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;
    if (!line.startsWith(':')) {
      throw new Error(`Intel HEX line ${index + 1} does not start with ':'`);
    }
    const bytes = [];
    for (let at = 1; at + 1 < line.length; at += 2) bytes.push(parseInt(line.slice(at, at + 2), 16));
    if (bytes.some((value) => Number.isNaN(value))) {
      throw new Error(`Intel HEX line ${index + 1} has a non-hex character`);
    }
    const checksum = bytes.pop() ?? 0;
    const sum = bytes.reduce((total, value) => (total + value) & 0xff, 0);
    if (((sum + checksum) & 0xff) !== 0) {
      throw new Error(`Intel HEX line ${index + 1} fails its checksum`);
    }
    const [length, addressHigh, addressLow, type] = bytes;
    const address = (addressHigh << 8) | addressLow;
    if (type === 1) {
      sawEnd = true;
      return;
    }
    if (type !== 0) return; // extended-address and start-address records carry no code
    for (let offset = 0; offset < length; offset += 1) {
      const value = bytes[4 + offset];
      const byteAddress = address + offset;
      const word = byteAddress >> 1;
      if (word >= words) throw new Error(`Intel HEX line ${index + 1} writes past the flash`);
      if (byteAddress & 1) program[word] = (program[word] & 0x00ff) | (value << 8);
      else program[word] = (program[word] & 0xff00) | value;
    }
  });
  if (!sawEnd) throw new Error('Intel HEX file has no end-of-file record');
  return program;
}

/** `Serial` ends its lines with CRLF; the pages and the comparison speak LF. */
export function normalizeSerial(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export interface SketchRun {
  /** Exactly what the USART transmitted, CRLF and all. */
  serial: string;
  /** Instructions executed, so the UI can say what "0.4 s of Arduino time" means. */
  cycles: number;
  /**
   * `complete` - the expected serial has been printed; `budget` - the cycle cap was reached first
   * (a program that prints more than the page says, or hangs); `running` - stopped on request.
   */
  status: 'complete' | 'budget' | 'running';
}

/** One emulated Uno: construct it, then call `step` until `done`. */
export class AvrSketch {
  private readonly cpu: CPU;
  private readonly usart: AVRUSART;
  // Held so the peripherals stay alive: `avr8js` registers their clock events on construction and a
  // collected instance would stop answering the program's register writes.
  private readonly peripherals: unknown[];
  serial = '';
  cycles = 0;

  constructor(hex: string) {
    const program = parseIntelHex(hex);
    this.cpu = new CPU(program);
    const usart = new AVRUSART(this.cpu, usart0Config, AVR_FREQ_HZ);
    usart.onByteTransmit = (byte: number) => {
      this.serial += String.fromCharCode(byte);
    };
    this.usart = usart;
    this.peripherals = [
      usart,
      new AVRTimer(this.cpu, timer0Config),
      new AVRTimer(this.cpu, timer1Config),
      new AVRTimer(this.cpu, timer2Config),
      new AVRIOPort(this.cpu, portBConfig),
      new AVRIOPort(this.cpu, portCConfig),
      new AVRIOPort(this.cpu, portDConfig),
    ];
  }

  /** Execute at most `cycles` instructions. */
  step(cycles: number = CHUNK_CYCLES): void {
    for (let index = 0; index < cycles; index += 1) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
    this.cycles += cycles;
  }

  /** The serial so far, LF-normalised. */
  get output(): string {
    return normalizeSerial(this.serial);
  }
}

/**
 * Run a hex to its expected serial, or to the cycle cap.
 *
 * The stop condition is the *page's own text* rather than an idle timer: a lesson with `delay(500)`
 * between prints is silent for 8 million cycles, and "no output for a while" would call that finished.
 */
export function runSketch(
  hex: string,
  options: { expected?: string; maxCycles?: number } = {}
): SketchRun {
  const sketch = new AvrSketch(hex);
  const maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES;
  const expected = options.expected ?? '';
  while (sketch.cycles < maxCycles) {
    sketch.step(Math.min(CHUNK_CYCLES, maxCycles - sketch.cycles));
    if (expected !== '' && compareStdout(sketch.output, expected, 'normalized').matched) {
      return { serial: sketch.output, cycles: sketch.cycles, status: 'complete' };
    }
  }
  const matched = expected !== '' && compareStdout(sketch.output, expected, 'normalized').matched;
  return { serial: sketch.output, cycles: sketch.cycles, status: matched ? 'complete' : 'budget' };
}
