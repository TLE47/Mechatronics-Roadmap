/**
 * The Board card's rules (`app/src/boardBridge.ts`).
 *
 * The embedded C lessons are read on GitHub, and a learner cannot compile C in the tab: the Python
 * worker runs CPython, and an AVR toolchain does not exist at this app's weight. So the course does
 * what it can prove and says so:
 *
 *  - the **sketch** is the lesson's own `Full Solution`, generated from the page
 *    (`scripts/extract_and_compile_sketches.py --write-panel`) so the card cannot show an older copy;
 *  - the **serial output** beside it is the exact text CI already proves, by compiling the sketch
 *    against a host mock of `Arduino.h` and comparing `setup()`'s output with the lesson's
 *    `### Expected Output`;
 *  - the **board** runs somewhere else — a third-party simulator in another tab — and the learner
 *    pastes the sketch there. Nothing typed there comes back here.
 *
 * What this module keeps honest is the half the page can grade: a prediction, compared with the
 * verified serial using the same whitespace rule the Python runner uses (`outputMatch.ts`), so the
 * card is a check the learner cannot pass by guessing, and the log records it as a run.
 *
 * Pure on purpose (no JSON import, no React): Node's type stripping cannot import a `.json` module,
 * and the unit suite grades this file directly.
 */

import { compareStdout, type OutputComparison } from './outputMatch.ts';

export const BOARD_SCHEMA = 'mechalab.board-bridges/1';

export interface BoardBridge {
  /** The lesson's slug, e.g. `S0_7-arduino-uno-digital-io-and-pullups`. */
  id: string;
  /** The page's own `# ` heading, backticks and all - `displayTitle` makes it readable. */
  title: string;
  /** Repository-relative path of the lesson page the sketch was extracted from. */
  page: string;
  /** The serial output CI proves for `solution`, byte for byte. */
  expectedOutput: string;
  starter: string;
  solution: string;
}

export interface BoardBridgeFile {
  schema: string;
  generatedBy: string;
  bridges: BoardBridge[];
}

/** A third-party simulator the card hands off to. Both are links: see `the embed is impossible` below. */
export interface BoardSimulator {
  id: string;
  name: string;
  url: string;
  /** What the reader does there, in order, one line each. */
  steps: string[];
}

/**
 * Why these are links and not an `<iframe>`: the app is served as an isolated document
 * (`app/public/sw.js` adds COOP/COEP so `SharedArrayBuffer` exists and Stop can interrupt the
 * worker), and under `require-corp` a cross-origin frame loads only if the framed site sends
 * CORP/COEP. Neither simulator does, so a frame would be blocked outright - and Wokwi's own embed
 * support is an unsupported prototype. A new tab is the only shape that works, which is why the
 * polish lives on this side of the seam.
 */
export const BOARD_SIMULATORS: readonly BoardSimulator[] = [
  {
    id: 'wokwi',
    name: 'Wokwi',
    url: 'https://wokwi.com/projects/new',
    steps: [
      'Pick Arduino Uno, then paste the sketch into the code pane.',
      'Press the green play button.',
      'Open the Serial Monitor tab and compare it with the output this page shows.',
    ],
  },
  {
    id: 'tinkercad',
    name: 'Tinkercad Circuits',
    url: 'https://www.tinkercad.com/circuits',
    steps: [
      'Create a circuit, drop in an Arduino Uno and open Code → Text.',
      'Paste the sketch, then Start Simulation.',
      'Read the Serial Monitor at the bottom of the code pane.',
    ],
  },
];

const REQUIRED_TEXT_FIELDS = ['id', 'title', 'page', 'expectedOutput', 'starter', 'solution'] as const;

/**
 * Narrow the generated document, refusing the shapes that would render as a lie.
 *
 * The data is generated, so a malformed one means the generator or a hand-edit broke - and a card
 * that silently shows an empty serial or a sketch with no `setup()` is worse than a loud failure.
 */
export function validateBridges(raw: unknown): BoardBridge[] {
  if (!raw || typeof raw !== 'object') throw new Error('board bridges: expected an object');
  const file = raw as Partial<BoardBridgeFile>;
  if (file.schema !== BOARD_SCHEMA) {
    throw new Error(`board bridges: schema is ${String(file.schema)}, expected ${BOARD_SCHEMA}`);
  }
  if (!Array.isArray(file.bridges) || file.bridges.length === 0) {
    throw new Error('board bridges: no bridges in the document');
  }
  const seen = new Set<string>();
  const bridges = file.bridges.map((entry, index) => {
    const bridge = entry as Partial<BoardBridge>;
    for (const field of REQUIRED_TEXT_FIELDS) {
      const value = bridge[field];
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`board bridges: bridge ${index} has no ${field}`);
      }
    }
    const complete = bridge as BoardBridge;
    if (seen.has(complete.id)) throw new Error(`board bridges: duplicate id ${complete.id}`);
    seen.add(complete.id);
    if (!complete.page.endsWith('.md')) {
      throw new Error(`board bridges: ${complete.id} names ${complete.page}, which is not a page`);
    }
    if (!complete.solution.includes('void setup()')) {
      throw new Error(`board bridges: ${complete.id} has a solution with no setup()`);
    }
    return complete;
  });
  return bridges;
}

/** The bridge for an id, or `undefined` so a caller can fall back instead of throwing on the UI path. */
export function bridgeById(bridges: readonly BoardBridge[], id: string): BoardBridge | undefined {
  return bridges.find((bridge) => bridge.id === id);
}

/** The card's heading: the page's heading without its Markdown backticks, on one line. */
export function displayTitle(title: string): string {
  return title.replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Grade a prediction against the serial CI proved, under the runner's own whitespace rule.
 *
 * `normalized` (the default the Python lessons use) ignores spacing but not numbers or line breaks,
 * so a learner who predicts the right values in the wrong column still passes - and one who predicts
 * the wrong value does not, which is the only thing this card is claiming to check.
 */
export function gradeBoardPrint(bridge: BoardBridge, text: string): OutputComparison {
  return compareStdout(text ?? '', bridge.expectedOutput, 'normalized');
}

/** One sentence for the verdict, so the card and any test agree on what "passed" says. */
export function verdictLine(comparison: OutputComparison): string {
  if (comparison.matched) {
    return comparison.formattingDiffers
      ? 'Matches the verified serial (spacing differs, the numbers and lines do not).'
      : 'Matches the verified serial.';
  }
  return comparison.firstDiffLine === null
    ? 'That is not the serial this sketch prints.'
    : `Not yet: line ${comparison.firstDiffLine} differs from the verified serial.`;
}
