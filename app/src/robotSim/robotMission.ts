/**
 * The Robot tab's mission (`app/src/robotSim/robotMission.ts`).
 *
 * A robot run is a view of the learner's own code, not a second exercise, so this module invents no
 * values: every target is read from the scenario's `expected` reading, which the model already pins
 * to the lesson's own full solution. The lesson goal above `main.py` stays the brief; the mission is
 * the same goal in machine terms — the few values that tell the learner what the robot is trying to
 * reach, and whether this run reached it.
 *
 * `robotProgress` is pure on purpose. `npm run test:robot` can prove, without a browser, that every
 * target equals the lesson's expected value, that a full solution completes the mission, that a
 * partial reading does not, that floats are compared with their own tolerance and that a command
 * list is compared element by element. The pane only renders what this module returns.
 */
import type { RobotLessonId, RobotReading, RobotScenario } from './model';

/** The shape of one expected value, which decides how a current reading is compared to it. */
export type RobotTargetKind = 'number' | 'text' | 'boolean' | 'list';

export type RobotTargetValue = number | string | boolean | number[];

/** One value the mission asks the run to reach, and the sentence a tap on its chip shows. */
export interface RobotMissionTarget {
  key: keyof RobotReading;
  label: string;
  kind: RobotTargetKind;
  target: RobotTargetValue;
  unit?: string;
  /** Numbers only: how far a reading may sit from the target and still count as reached. */
  tolerance?: number;
  hint: string;
}

/** The tab's short, distinct goal: a title, one line, and the values that make it concrete. */
export interface RobotMission {
  title: string;
  blurb: string;
  targets: RobotMissionTarget[];
}

interface TargetSpec {
  key: keyof RobotReading;
  label: string;
  kind: RobotTargetKind;
  unit?: string;
  tolerance?: number;
  hint: string;
}

interface MissionSpec {
  title: string;
  blurb: string;
  targets: readonly TargetSpec[];
}

/**
 * The seven missions, in the learner's language.
 *
 * The copy names the idea the lesson teaches (relative updates, clamping, a loop over a list, a
 * while loop) rather than repeating the expected output: a target's value is always read from
 * `scenario.expected`, so a lesson whose solution changes cannot leave a stale number on screen.
 */
const MISSIONS: Record<RobotLessonId, MissionSpec> = {
  'P.1': {
    title: 'Wake the rover',
    blurb: 'Update the rover’s state in place, one relative change at a time.',
    targets: [
      {
        key: 'mode',
        label: 'Mode',
        kind: 'text',
        hint: 'The status string the rover should report.',
      },
      {
        key: 'encoderTicks',
        label: 'Encoder',
        kind: 'number',
        unit: 'ticks',
        tolerance: 1e-6,
        hint: 'Drive 25 ticks forward from the old reading.',
      },
      {
        key: 'batteryVolts',
        label: 'Battery',
        kind: 'number',
        unit: 'V',
        tolerance: 0.005,
        hint: 'Drop the old reading by 0.45 V.',
      },
      {
        key: 'eStop',
        label: 'E-stop',
        kind: 'boolean',
        hint: 'Leave the switch alone: it stays clear.',
      },
    ],
  },
  'P.2': {
    title: 'Drive one tick',
    blurb: 'Turn the formulas into arithmetic the cart can act on: where it is, what the divider reads, and the energy it carries.',
    targets: [
      {
        key: 'positionM',
        label: 'Position',
        kind: 'number',
        unit: 'm',
        tolerance: 1e-6,
        hint: 'Start position plus speed times elapsed time.',
      },
      {
        key: 'sensorVolts',
        label: 'Sense pin',
        kind: 'number',
        unit: 'V',
        tolerance: 0.005,
        hint: 'Supply times the bottom resistor over the sum of both.',
      },
      {
        key: 'kineticEnergyJ',
        label: 'Energy',
        kind: 'number',
        unit: 'J',
        tolerance: 0.01,
        hint: 'Half the mass times the speed squared.',
      },
    ],
  },
  'P.6': {
    title: 'Measure the bench',
    blurb: 'Two ranges from the same bearing: the square root of the squares turns a pair of coordinates into a distance.',
    targets: [
      {
        key: 'distanceD1',
        label: 'Range (3, 4)',
        kind: 'number',
        unit: 'm',
        tolerance: 0.0001,
        hint: 'Root of the sum of the squares of 3 and 4.',
      },
      {
        key: 'distanceD2',
        label: 'Range (0.6, 0.8)',
        kind: 'number',
        unit: 'm',
        tolerance: 0.0001,
        hint: 'The same 3-4-5 triangle, scaled down ten times.',
      },
    ],
  },
  'P.7': {
    title: 'Convert to base units',
    blurb: 'Milliamps, kilo-ohms and microseconds into amps, ohms and seconds — then Ohm\'s law on the converted values.',
    targets: [
      {
        key: 'currentA',
        label: 'Current',
        kind: 'number',
        unit: 'A',
        tolerance: 1e-6,
        hint: '15.0 mA in amps.',
      },
      {
        key: 'resistanceOhm',
        label: 'Resistance',
        kind: 'number',
        unit: '\u03a9',
        tolerance: 0.05,
        hint: '0.22 k\u03a9 in ohms.',
      },
      {
        key: 'voltageV',
        label: 'Drop',
        kind: 'number',
        unit: 'V',
        tolerance: 0.005,
        hint: 'The converted current times the converted resistance.',
      },
      {
        key: 'timeS',
        label: 'Time',
        kind: 'number',
        unit: 's',
        tolerance: 1e-9,
        hint: '500.0 \u00b5s in seconds.',
      },
    ],
  },
  'P.3': {
    title: 'Guard the motor',
    blurb: 'Decide, clamp, and drop the output while the e-stop is pressed.',
    targets: [
      {
        key: 'clampedHigh',
        label: 'High',
        kind: 'number',
        tolerance: 1e-6,
        hint: 'Hold the high command inside 0–255.',
      },
      {
        key: 'clampedLow',
        label: 'Low',
        kind: 'number',
        tolerance: 1e-6,
        hint: 'Hold the low command inside 0–255.',
      },
      {
        key: 'safeOutput',
        label: 'Output',
        kind: 'number',
        tolerance: 1e-6,
        hint: 'An active e-stop cuts the output to zero.',
      },
    ],
  },
  'P.4': {
    title: 'Sort the convoy',
    blurb: 'Walk the convoy once, clamping every command in the loop.',
    targets: [
      {
        key: 'clampedCommands',
        label: 'Commands',
        kind: 'list',
        tolerance: 1e-6,
        hint: 'Clamp every raw command, in the list’s own order.',
      },
      {
        key: 'totalCommand',
        label: 'Total',
        kind: 'number',
        tolerance: 1e-6,
        hint: 'Add each clamped command as the loop runs.',
      },
      {
        key: 'meanCommand',
        label: 'Mean',
        kind: 'number',
        tolerance: 0.01,
        hint: 'Divide the running total by the list’s length.',
      },
    ],
  },
  'P.5': {
    title: 'Dock the arm',
    blurb: 'Turn the while loop into four visible steps and dock the joint.',
    targets: [
      {
        key: 'step',
        label: 'Steps',
        kind: 'number',
        tolerance: 1e-6,
        hint: 'Advance the counter once per pass.',
      },
      {
        key: 'positionM',
        label: 'Position',
        kind: 'number',
        unit: 'm',
        tolerance: 0.005,
        hint: 'Four steps of travel land on the dock.',
      },
    ],
  },
};

/** Read one expected value, refusing a target the scenario cannot back with its own solution. */
function targetValue(scenario: RobotScenario, spec: TargetSpec): RobotTargetValue {
  const value = scenario.expected[spec.key];
  if (spec.kind === 'list') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
      throw new Error(`${scenario.lessonId}: mission target ${String(spec.key)} is not a finite list`);
    }
    return value.slice();
  }
  if (spec.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${scenario.lessonId}: mission target ${String(spec.key)} is not a finite number`);
    }
    return value;
  }
  if (spec.kind === 'text') {
    if (typeof value !== 'string') {
      throw new Error(`${scenario.lessonId}: mission target ${String(spec.key)} is not text`);
    }
    return value;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${scenario.lessonId}: mission target ${String(spec.key)} is not a boolean`);
  }
  return value;
}

/** The lesson's mission, with every target read from the lesson's own expected reading. */
export function missionFor(scenario: RobotScenario): RobotMission {
  const spec = MISSIONS[scenario.lessonId];
  return {
    title: spec.title,
    blurb: spec.blurb,
    targets: spec.targets.map((target) => ({
      key: target.key,
      label: target.label,
      kind: target.kind,
      target: targetValue(scenario, target),
      unit: target.unit,
      tolerance: target.tolerance,
      hint: target.hint,
    })),
  };
}

/** One target with what the current reading says, and whether the two agree. */
export interface RobotTargetState {
  target: RobotMissionTarget;
  current: RobotTargetValue | null;
  met: boolean;
}

export interface RobotProgress {
  rows: RobotTargetState[];
  met: number;
  total: number;
  complete: boolean;
  /** Whether the reading carries any value at all: a run that has not bound anything has not started. */
  started: boolean;
}

/** What an empty reading shows: no targets reached, and no percentage pretending a failure. */
export const NO_ROBOT_PROGRESS: RobotProgress = {
  rows: [],
  met: 0,
  total: 0,
  complete: false,
  started: false,
};

function readingValue(reading: RobotReading | null, key: keyof RobotReading): RobotTargetValue | null {
  const value = reading?.[key];
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.slice();
  return value;
}

function numbersAgree(current: number, target: number, tolerance: number | undefined): boolean {
  return Number.isFinite(current) && Math.abs(current - target) <= (tolerance ?? 1e-6);
}

/** Whether one current value reaches its target. Exported so the model suite can pin the rules. */
export function targetReached(
  target: RobotMissionTarget,
  current: RobotTargetValue | null
): boolean {
  if (current === null || current === undefined) return false;
  switch (target.kind) {
    case 'number':
      return typeof current === 'number' && numbersAgree(current, target.target as number, target.tolerance);
    case 'text':
      return current === target.target;
    case 'boolean':
      return current === target.target;
    case 'list': {
      const expected = target.target as number[];
      if (!Array.isArray(current) || current.length !== expected.length) return false;
      return expected.every((value, index) =>
        numbersAgree(current[index], value, target.tolerance)
      );
    }
    default:
      return false;
  }
}

/**
 * This reading against this lesson's mission.
 *
 * `met` counts targets that already agree, so a run that has just bound one value says "1 of 4"
 * instead of a percentage of a botched answer. `complete` is false for an empty reading even when a
 * scenario somehow had no targets.
 */
export function robotProgress(reading: RobotReading | null, scenario: RobotScenario): RobotProgress {
  const mission = missionFor(scenario);
  const started =
    reading !== null &&
    Object.values(reading).some((value) => value !== null && value !== undefined);
  const rows = mission.targets.map((target) => {
    const current = readingValue(reading, target.key);
    return { target, current, met: targetReached(target, current) };
  });
  const met = rows.filter((row) => row.met).length;
  return {
    rows,
    met,
    total: rows.length,
    complete: rows.length > 0 && met === rows.length,
    started,
  };
}

/** One executed line, with the values that were visible as it began. */
export interface RobotSourceFrame {
  line: number;
  reading: RobotReading | null;
}

/** The 1-based main.py line that last changed each target's value. */
export type RobotSourceLines = Partial<Record<keyof RobotReading, number>>;

function sameReadingValue(a: RobotTargetValue, b: RobotTargetValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => value === b[index])
    );
  }
  return a === b;
}

/** Every line nested inside a `def`, which is not where a returned value is written down. */
function functionBodyLines(source: string): Set<number> {
  const lines = source.split('\n');
  const body = new Set<number>();
  const defs: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    while (defs.length && indent <= defs[defs.length - 1]) defs.pop();
    if (/^(?:async\s+)?def\s+/.test(text)) {
      defs.push(indent);
      continue;
    }
    if (defs.length) body.add(index + 1);
  }
  return body;
}

/**
 * The main.py line behind each mission chip's current value.
 *
 * The worker's trace fires before a line runs, so the reading carried by a frame at line N is what
 * the previous learner line left behind. A value that changes between two frames was therefore
 * produced by the line the earlier frame named, not by N itself. Using that shift is what makes a
 * P.3 chip point at the branch that actually ran (`clamped_high = 255` on line 8) instead of the
 * assignment furthest down the file, which never executed. A value first seen when the run's final
 * probe reports (line 0) belongs to the last learner line that ran.
 *
 * A `def` body is skipped when advancing that previous line. P.5's `pos_m = step_position(...)`
 * enters the function on line 2 and only stores the result on line 11; without the skip the body
 * would steal the pointer from the line that actually wrote the global. A value changed inside a
 * function is credited to the line that called it, which is the line a learner edits to change the
 * result.
 *
 * This is provenance, not a guess: the lines come from the run's own frames, so a learner's edited,
 * renamed or reordered code points at the lines that really changed the number on the chip.
 */
export function sourceLinesForFrames(
  frames: readonly RobotSourceFrame[],
  mission: RobotMission,
  sourceText: string
): RobotSourceLines {
  const functionBodies = functionBodyLines(sourceText);
  const lines: RobotSourceLines = {};
  const last = new Map<keyof RobotReading, RobotTargetValue>();
  let previous = 0;
  for (const frame of frames) {
    if (frame.line < 0) continue;
    if (frame.reading) {
      for (const target of mission.targets) {
        const value = readingValue(frame.reading, target.key);
        if (value === null) continue;
        const before = last.get(target.key);
        if (before === undefined || !sameReadingValue(before, value)) {
          if (previous > 0) lines[target.key] = previous;
          last.set(target.key, value);
        }
      }
    }
    if (frame.line === 0) break;
    if (!functionBodies.has(frame.line)) previous = frame.line;
  }
  return lines;
}

/** One number at reading size: two decimals at most, and no binary tail or trailing zeros. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatValue(
  kind: RobotTargetKind,
  value: RobotTargetValue,
  unit?: string
): string {
  if (Array.isArray(value)) return '[' + value.join(', ') + ']';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'number') return formatNumber(value) + (unit ? ' ' + unit : '');
  return value;
}

/** A target as a chip shows it, e.g. `425 ticks`, `[0, 0, 64]`, `on`. */
export function formatTarget(target: RobotMissionTarget): string {
  return formatValue(target.kind, target.target, target.unit);
}

/** What the run currently has, in the same shape as its target; a missing name stays a dash. */
export function formatCurrent(state: RobotTargetState): string {
  if (state.current === null) return '—';
  return formatValue(state.target.kind, state.current, state.target.unit);
}
