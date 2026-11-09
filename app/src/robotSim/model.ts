/**
 * The robot view's lesson data (`app/src/robotSim/model.ts`).
 *
 * The lesson text is the source of truth. Each entry below names one lesson id, and its goal and
 * starter code are read from that lesson's own `PYTHON_LESSONS` record — they are never copied or
 * rewritten here. The only robot-specific half is the small probe appended to a run: it reads the
 * names the lesson itself binds, so the view shows the learner's variables rather than a second,
 * invented exercise.
 *
 * Nothing here reads a clock or touches React, so `npm run test:robot` can prove that every robot
 * lesson is the lesson record, that its probe names the lesson's own values, and that the parser
 * accepts only the reading shape the stage draws.
 */
import { PYTHON_LESSONS, type PythonLessonItem } from '../data/pythonLessonsData.ts';
import { ROBOT_LESSON_IDS, type RobotLessonId } from '../robotLessons.ts';

export { ROBOT_LESSON_IDS, type RobotLessonId };

/** The four quarter turns the robot sprite can face; kept for the shared drawing. */
export type Heading = 0 | 1 | 2 | 3;

/** The values one lesson's code can leave for the robot view. Every field is optional: a half-run
 * code, or a learner who renamed a variable, still shows the values that exist. */
export interface RobotReading {
  mode?: string | null;
  eStop?: boolean | null;
  encoderTicks?: number | null;
  batteryVolts?: number | null;
  rawHigh?: number | null;
  rawLow?: number | null;
  rawNormal?: number | null;
  eStopPressed?: boolean | null;
  clampedHigh?: number | null;
  clampedLow?: number | null;
  safeOutput?: number | null;
  rawCommands?: number[] | null;
  clampedCommands?: number[] | null;
  totalCommand?: number | null;
  meanCommand?: number | null;
  positionM?: number | null;
  velocityMS?: number | null;
  step?: number | null;
}

/** One lesson's robot view: the lesson record, the Python bridge, and the values its solution binds. */
export interface RobotScenario {
  lessonId: RobotLessonId;
  lesson: PythonLessonItem;
  /** The module installed before the learner's program; it defines `_robot_send` and `_robot_step`. */
  python: string;
  /** The code appended after the learner's program: it sends the lesson's final names to the view. */
  probe: string;
  /** What the lesson's own full solution produces, used by the browser suite. */
  expected: RobotReading;
}

export interface RobotReply {
  value?: unknown;
  error?: string;
}

/** The message the worker posts when the probe runs. */
export interface RobotCommandMessage {
  command: string;
  args: Record<string, unknown>;
  line: number;
}

/** What the simulator's controls can ask of the run it belongs to. Pause/Step stay for the shared
 * runner API, but this view uses start, stop and the editor's line marker. */
export interface RobotRunApi {
  start: (
    scenario: RobotScenario,
    onCommand: (message: RobotCommandMessage) => Promise<RobotReply>
  ) => void;
  pause: () => void;
  resume: () => void;
  step: () => void;
  stop: () => void;
  /** Draw the box around the line the interpreter is on, or clear it with null. */
  showLine: (line: number | null) => void;
  isRunning: boolean;
  paused: boolean;
  pauseCapable: boolean;
}

/**
 * The Python bridge, and nothing more.
 *
 * `default=str` keeps a learner's unexpected object from turning a successful run into a JSON
 * error in the robot view. The probe and the line sampler are separate so the Python installed here
 * stays identical for every lesson; only the names they read differ.
 */
export function robotPythonSource(step = ''): string {
  const lines = [
    'import json as _robot_json',
    '',
    'def _robot_send(__line=0, **values):',
    '    """Send the names this lesson binds to the Robot view."""',
    '    __mechalab_robot__("telemetry", _robot_json.dumps(values, default=str), __line)',
  ];
  if (step) lines.push('', step);
  return lines.join('\n');
}

type RobotField = readonly [keyof RobotReading, string];

const PROBES: Record<RobotLessonId, { fields: readonly RobotField[]; expected: RobotReading }> = {
  'P.1': {
    fields: [
      ['mode', 'robot_mode'],
      ['eStop', 'is_estop_active'],
      ['encoderTicks', 'encoder_ticks'],
      ['batteryVolts', 'battery_level'],
    ],
    expected: { mode: 'ACTIVE', eStop: false, encoderTicks: 425, batteryVolts: 12.15 },
  },
  'P.3': {
    fields: [
      ['rawHigh', 'raw_cmd_high'],
      ['rawLow', 'raw_cmd_low'],
      ['rawNormal', 'raw_cmd_normal'],
      ['eStopPressed', 'is_estop_pressed'],
      ['clampedHigh', 'clamped_high'],
      ['clampedLow', 'clamped_low'],
      ['safeOutput', 'safe_output'],
    ],
    expected: {
      rawHigh: 310,
      rawLow: -45,
      rawNormal: 180,
      eStopPressed: true,
      clampedHigh: 255,
      clampedLow: 0,
      safeOutput: 0,
    },
  },
  'P.4': {
    fields: [
      ['rawCommands', 'raw_commands'],
      ['clampedCommands', 'clamped_commands'],
      ['totalCommand', 'total_cmd'],
      ['meanCommand', 'mean_cmd'],
    ],
    expected: {
      rawCommands: [-30, 0, 64, 128, 200, 310],
      clampedCommands: [0, 0, 64, 128, 200, 255],
      totalCommand: 647,
      meanCommand: 107.83,
    },
  },
  'P.5': {
    fields: [
      ['positionM', 'pos_m'],
      ['velocityMS', 'vel_m_s'],
      ['step', 'step'],
    ],
    expected: { positionM: 1.2, velocityMS: 1.5, step: 4 },
  },
};

function fieldLine(indent: string, [field, name]: RobotField): string {
  return `${indent}${field}=globals().get("${name}"),`;
}

/** The final read, unchanged: it is what fills a value the last line binds. */
function probeSource(fields: readonly RobotField[]): string {
  return ['_robot_send(', ...fields.map((field) => fieldLine('    ', field)), ')'].join('\n');
}

/** The same fields, sampled before each executed line so the stage can move during the run. */
function stepSource(fields: readonly RobotField[]): string {
  return [
    'def _robot_step(__line):',
    '    """Send the lesson values visible at this line to the Robot view."""',
    '    _robot_send(__line,',
    ...fields.map((field) => fieldLine('        ', field)),
    '    )',
  ].join('\n');
}

function isRobotLessonId(id: string): id is RobotLessonId {
  return (ROBOT_LESSON_IDS as readonly string[]).includes(id);
}

function readingNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readingBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readingText(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 80) : null;
}

function readingNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value
    .slice(0, 16)
    .map(readingNumber)
    .filter((number): number is number => number !== null);
  return numbers.length ? numbers : null;
}

/**
 * The reading the worker sent, or `null` for a payload that is not an object.
 *
 * Everything crossing the worker boundary is data, so each field is checked rather than trusted.
 * A missing field stays `null`, which the stage draws as a placeholder.
 */
export function parseRobotReading(raw: unknown): RobotReading | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  return {
    mode: readingText(source.mode),
    eStop: readingBoolean(source.eStop),
    encoderTicks: readingNumber(source.encoderTicks),
    batteryVolts: readingNumber(source.batteryVolts),
    rawHigh: readingNumber(source.rawHigh),
    rawLow: readingNumber(source.rawLow),
    rawNormal: readingNumber(source.rawNormal),
    eStopPressed: readingBoolean(source.eStopPressed),
    clampedHigh: readingNumber(source.clampedHigh),
    clampedLow: readingNumber(source.clampedLow),
    safeOutput: readingNumber(source.safeOutput),
    rawCommands: readingNumbers(source.rawCommands),
    clampedCommands: readingNumbers(source.clampedCommands),
    totalCommand: readingNumber(source.totalCommand),
    meanCommand: readingNumber(source.meanCommand),
    positionM: readingNumber(source.positionM),
    velocityMS: readingNumber(source.velocityMS),
    step: readingNumber(source.step),
  };
}

/**
 * Everything wrong with one robot lesson, as sentences.
 *
 * The first check is the one the request turns on: the scenario's lesson must be the same record
 * the editor and reader use, and its goal and starter code must be that record's own strings.
 * The rest keep a malformed probe off the screen and stop the old grid exercise from creeping back
 * into the view.
 */
export function scenarioProblems(entry: RobotScenario): string[] {
  const problems: string[] = [];
  const lesson = PYTHON_LESSONS.find((candidate) => candidate.id === entry.lessonId);
  if (!lesson) problems.push(`lesson ${entry.lessonId} is not in PYTHON_LESSONS`);
  else if (entry.lesson !== lesson) problems.push(`lesson ${entry.lessonId} is a copy, not the lesson record`);
  else {
    if (!lesson.goal.trim()) problems.push(`lesson ${entry.lessonId} has no goal`);
    if (!lesson.starterCode.trim()) problems.push(`lesson ${entry.lessonId} has no starter code`);
    if (!lesson.fullSolution.trim()) problems.push(`lesson ${entry.lessonId} has no full solution`);
    if (!lesson.expectedOutput.trim()) problems.push(`lesson ${entry.lessonId} has no expected output`);
  }
  if (!entry.python.includes('def _robot_send(')) problems.push('the Python bridge does not define _robot_send');
  if (!entry.python.includes('def _robot_step(')) problems.push('the Python bridge does not define _robot_step');
  if (!entry.probe.includes('_robot_send(')) problems.push('the probe does not call _robot_send');
  for (const old of ['move_forward', 'turn_right', 'turn_left', 'wall_ahead', 'wall_distance']) {
    if (entry.probe.includes(old)) problems.push(`the probe still uses the old '${old}' command`);
  }
  const expectedKeys = Object.keys(entry.expected);
  if (expectedKeys.length < 2) problems.push('the expected reading has fewer than two values');
  for (const [name, value] of Object.entries(entry.expected)) {
    if (value === null || value === undefined) problems.push(`expected.${name} is empty`);
    else if (typeof value === 'number' && !Number.isFinite(value)) problems.push(`expected.${name} is not finite`);
    else if (Array.isArray(value) && value.some((item) => !Number.isFinite(item))) {
      problems.push(`expected.${name} has a non-finite value`);
    }
  }
  return problems;
}

/** Build one scenario from its lesson record, or null where the lesson has no robot view. */
export function robotScenario(lessonId: string): RobotScenario | null {
  if (!isRobotLessonId(lessonId)) return null;
  const lesson = PYTHON_LESSONS.find((candidate) => candidate.id === lessonId);
  if (!lesson) {
    console.error(`Robot lesson ${lessonId} is missing from PYTHON_LESSONS`);
    return null;
  }
  const fields = PROBES[lessonId].fields;
  const entry: RobotScenario = {
    lessonId,
    lesson,
    python: robotPythonSource(stepSource(fields)),
    probe: probeSource(fields),
    expected: PROBES[lessonId].expected,
  };
  const problems = scenarioProblems(entry);
  if (problems.length) {
    // A malformed entry is a lesson bug, not a learner's: keep the broken view off the screen and
    // say what is wrong in the console. `npm run test:robot` fails on the same list.
    console.error(`Robot lesson ${lessonId} is invalid: ${problems.join('; ')}`);
    return null;
  }
  return entry;
}

/** Every robot lesson, in the order the four cards name them. */
export const ROBOT_SCENARIOS: RobotScenario[] = ROBOT_LESSON_IDS.flatMap((id) => {
  const entry = robotScenario(id);
  return entry ? [entry] : [];
});
