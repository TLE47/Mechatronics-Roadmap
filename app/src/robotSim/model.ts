/**
 * The robot simulator's scenario data and pure rules (`app/src/robotSim/model.ts`).
 *
 * Conventions, stated once and used everywhere (model, stage, sensors, examples):
 * - `(0, 0)` is the top-left cell; `x` grows to the right and `y` grows downward.
 * - A `Heading` is `0 north, 1 east, 2 south, 3 west`; `HEADINGS` names them.
 * - `move_forward(1)` moves exactly one cell along the heading; a turn is exactly 90 degrees.
 *
 * The lesson is the source of truth: `SCENARIOS` is keyed by lesson id and names the Python API
 * that lesson exposes. Only the primitives below exist; a scenario enables a subset, so a lesson
 * never hands a learner a capability whose concept it has not taught yet.
 *
 * Nothing here reads a clock, draws anything or touches React, so `npm run test:robot` can pin
 * movement, collision, sensors, validation and determinism without a browser.
 */

export type Heading = 0 | 1 | 2 | 3;

export const HEADINGS = ['north', 'east', 'south', 'west'] as const;

export interface RobotPoint {
  x: number;
  y: number;
}

/** What the stage draws: the cell, the way it faces, and every cell visited so far. */
export interface RobotState extends RobotPoint {
  heading: Heading;
  trail: RobotPoint[];
}

/** The primitives a scenario may expose. A lesson enables some of them, never more. */
export type RobotCommandName =
  | 'move_forward'
  | 'turn_right'
  | 'turn_left'
  | 'say'
  | 'wall_ahead'
  | 'wall_distance';

export const ROBOT_COMMANDS: RobotCommandName[] = [
  'move_forward',
  'turn_right',
  'turn_left',
  'say',
  'wall_ahead',
  'wall_distance',
];

/** One command in a declared walk (a fast model test, not a prediction of Python). */
export interface RobotWalkStep {
  command: RobotCommandName;
  args?: Record<string, unknown>;
}

/** What a scenario's example must produce when it really runs. The browser suite checks this. */
export interface RobotExpectation {
  x: number;
  y: number;
  heading: Heading;
  /** How many cells the trail holds, the start square included. */
  trail: number;
  said?: string;
  completed: boolean;
  /** How many `move_forward` calls were stopped by a wall or the edge. */
  blockedMoves: number;
  /** The sensor values the example reads, keyed by command (`wall_ahead`, `wall_distance`). */
  sensors?: Record<string, boolean | number>;
}

/** One lesson's robot: its environment, the API it teaches, and what the learner should try. */
export interface RobotScenario {
  lessonId: string;
  title: string;
  concept: string;
  objective: string;
  challenge: string;
  cols: number;
  rows: number;
  start: RobotPoint & { heading: Heading };
  target: RobotPoint;
  walls: RobotPoint[];
  commands: RobotCommandName[];
  /** The Python module installed into the run namespace, generated from `commands`. */
  python: string;
  example: string;
  /** Source tokens the example must contain: the construct the lesson is teaching. */
  conceptTokens: string[];
  expected: RobotExpectation;
  /** The example's commands, for fast deterministic model tests. Never proof of the example. */
  modelWalk: RobotWalkStep[];
}

export interface RobotReply {
  value?: unknown;
  error?: string;
}

/** The message the worker posts before it blocks, waiting for the pane's reply. */
export interface RobotCommandMessage {
  command: string;
  args: Record<string, unknown>;
  line: number;
}

/** What the simulator's controls can ask of the run it belongs to. */
export interface RobotRunApi {
  start: (
    scenario: RobotScenario,
    onCommand: (message: RobotCommandMessage) => Promise<RobotReply>
  ) => void;
  pause: () => void;
  resume: () => void;
  step: () => void;
  stop: () => void;
  isRunning: boolean;
  paused: boolean;
  pauseCapable: boolean;
}

/** The Python each enabled primitive defines. Input validation is Python's, not JavaScript's. */
const PYTHON: Record<RobotCommandName, string> = {
  move_forward: [
    'def move_forward(steps=1):',
    '    """Move forward `steps` squares, stopping at a wall."""',
    '    if isinstance(steps, bool) or not isinstance(steps, int):',
    '        raise TypeError("move_forward() needs a whole number of squares, like 3.")',
    '    if steps < 0:',
    '        raise ValueError("move_forward() cannot take a negative number of squares.")',
    '    if steps == 0:',
    '        return',
    '    _robot_call("move_forward", steps=steps)',
  ].join('\n'),
  turn_right: [
    'def turn_right():',
    '    """Turn a quarter turn (90 degrees) to the right."""',
    '    _robot_call("turn_right")',
  ].join('\n'),
  turn_left: [
    'def turn_left():',
    '    """Turn a quarter turn (90 degrees) to the left."""',
    '    _robot_call("turn_left")',
  ].join('\n'),
  say: [
    'def say(text):',
    '    """Show a speech bubble above the robot."""',
    '    if not isinstance(text, str):',
    '        raise TypeError("say() needs a string; put the text in quotes.")',
    '    _robot_call("say", text=text)',
  ].join('\n'),
  wall_ahead: [
    'def wall_ahead():',
    '    """True when the next square is a wall or the edge of the grid."""',
    '    return bool(_robot_call("wall_ahead").get("value", False))',
  ].join('\n'),
  wall_distance: [
    'def wall_distance():',
    '    """How many squares the robot can move forward before a wall (0 = next to it)."""',
    '    return int(_robot_call("wall_distance").get("value", 0))',
  ].join('\n'),
};

/**
 * The Python API for one scenario, and nothing more.
 *
 * The helper is the whole bridge: it hands the simulator the command, the arguments as JSON and the
 * line the learner is on, then blocks until the page answers. A stop answer becomes
 * `KeyboardInterrupt`, which the runner already treats as a normal Stop. A primitive a lesson does
 * not enable is simply not defined, so Python raises `NameError` — the honest gate.
 */
export function pythonApiSource(commands: readonly RobotCommandName[]): string {
  const lines = [
    'import json as _robot_json',
    'import sys as _robot_sys',
    '',
    'def _robot_call(name, **kwargs):',
    '    """Ask the simulator to act, and return its answer."""',
    '    text = __mechalab_robot__(name, _robot_json.dumps(kwargs), _robot_sys._getframe(2).f_lineno)',
    '    if text == "stop":',
    '        raise KeyboardInterrupt',
    '    answer = _robot_json.loads(text)',
    '    if answer.get("error"):',
    '        raise RuntimeError(answer["error"])',
    '    return answer',
    '',
  ];
  for (const name of commands) lines.push(PYTHON[name], '');
  return lines.join('\n');
}

function scenario(entry: Omit<RobotScenario, 'python'>): RobotScenario {
  return { ...entry, python: pythonApiSource(entry.commands) };
}

/**
 * The four lessons whose objectives a grid can show.
 *
 * Each entry is the whole lesson integration: the API it enables, the world it runs in, the example
 * it offers, and what that example must produce when it actually runs.
 */
const SCENARIOS: RobotScenario[] = [
  scenario({
    lessonId: 'P.1',
    title: 'Variables drive the robot',
    concept: 'Variables and assignment',
    objective: 'Store a distance in a variable, then let the robot drive exactly that far.',
    challenge: 'Change distance to 4, run again, and name the square the robot stops on.',
    cols: 8,
    rows: 6,
    start: { x: 1, y: 4, heading: 1 },
    target: { x: 6, y: 4 },
    walls: [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 5, y: 5 },
    ],
    commands: ['move_forward', 'say'],
    conceptTokens: ['=', 'distance'],
    example: [
      'distance = 5',
      'robot_name = "Mecha"',
      '',
      'move_forward(distance)',
      'say("Hi, " + robot_name)',
    ].join('\n'),
    expected: { x: 6, y: 4, heading: 1, trail: 6, said: 'Hi, Mecha', completed: true, blockedMoves: 0 },
    modelWalk: [
      { command: 'move_forward', args: { steps: 5 } },
      { command: 'say', args: { text: 'Hi, Mecha' } },
    ],
  }),
  scenario({
    lessonId: 'P.3',
    title: 'The robot decides',
    concept: 'if / else and a sensor',
    objective: 'Ask the wall sensor a question and take the branch its answer deserves.',
    challenge: 'Delete the sensor call and move 4: the robot stops at the wall and the trail shows where.',
    cols: 8,
    rows: 6,
    start: { x: 1, y: 4, heading: 1 },
    target: { x: 6, y: 1 },
    walls: [
      { x: 4, y: 4 },
      { x: 4, y: 5 },
      { x: 5, y: 2 },
    ],
    commands: ['move_forward', 'turn_right', 'turn_left', 'wall_ahead', 'wall_distance'],
    conceptTokens: ['if', 'wall_ahead'],
    example: [
      'move_forward(3)',
      'if wall_ahead():',
      '    turn_left()',
      '    move_forward(3)',
      '    turn_right()',
      '    move_forward(3)',
      'else:',
      '    move_forward(4)',
    ].join('\n'),
    expected: { x: 6, y: 1, heading: 1, trail: 9, completed: true, blockedMoves: 1, sensors: { wall_ahead: true } },
    modelWalk: [
      { command: 'move_forward', args: { steps: 3 } },
      { command: 'wall_ahead' },
      { command: 'turn_left' },
      { command: 'move_forward', args: { steps: 3 } },
      { command: 'turn_right' },
      { command: 'move_forward', args: { steps: 3 } },
    ],
  }),
  scenario({
    lessonId: 'P.4',
    title: 'A loop makes a square',
    concept: 'for loops',
    objective: 'Repeat a move and a turn four times and watch the path close into a square.',
    challenge: 'Change range(4) to range(3) and predict which side will be missing.',
    cols: 7,
    rows: 7,
    start: { x: 2, y: 2, heading: 1 },
    target: { x: 2, y: 2 },
    walls: [
      { x: 1, y: 1 },
      { x: 6, y: 6 },
    ],
    commands: ['move_forward', 'turn_right'],
    conceptTokens: ['for', 'range'],
    example: ['for side in range(4):  # 4 sides of the square', '    move_forward(3)', '    turn_right()'].join('\n'),
    expected: { x: 2, y: 2, heading: 1, trail: 13, completed: true, blockedMoves: 0 },
    modelWalk: [
      { command: 'move_forward', args: { steps: 3 } },
      { command: 'turn_right' },
      { command: 'move_forward', args: { steps: 3 } },
      { command: 'turn_right' },
      { command: 'move_forward', args: { steps: 3 } },
      { command: 'turn_right' },
      { command: 'move_forward', args: { steps: 3 } },
      { command: 'turn_right' },
    ],
  }),
  scenario({
    lessonId: 'P.5',
    title: 'A function turns the robot',
    concept: 'def and reuse',
    objective: 'Put two turns in a function, then call it as one reusable idea.',
    challenge: 'Add a third turn to turn_around and predict where the robot ends up.',
    cols: 8,
    rows: 6,
    start: { x: 2, y: 4, heading: 1 },
    target: { x: 2, y: 4 },
    walls: [{ x: 1, y: 1 }],
    commands: ['move_forward', 'turn_right', 'turn_left'],
    conceptTokens: ['def', 'turn_around'],
    example: [
      'def turn_around():',
      '    turn_right()',
      '    turn_right()',
      '',
      'move_forward(2)',
      'turn_around()',
      'move_forward(2)',
    ].join('\n'),
    expected: { x: 2, y: 4, heading: 3, trail: 5, completed: true, blockedMoves: 0 },
    modelWalk: [
      { command: 'move_forward', args: { steps: 2 } },
      { command: 'turn_right' },
      { command: 'turn_right' },
      { command: 'move_forward', args: { steps: 2 } },
    ],
  }),
];

export const ROBOT_SCENARIOS = SCENARIOS;

/** The scenario for a lesson, or null when the lesson teaches with something other than a robot. */
export function robotScenario(lessonId: string): RobotScenario | null {
  const entry = SCENARIOS.find((candidate) => candidate.lessonId === lessonId);
  if (!entry) return null;
  const problems = scenarioProblems(entry);
  if (problems.length) {
    // A malformed entry is a lesson bug, not a learner's: keep the broken simulation off the screen
    // and say what is wrong in the console. `npm run test:robot` fails on the same list.
    console.error(`Robot scenario ${entry.lessonId} is invalid: ${problems.join('; ')}`);
    return null;
  }
  return entry;
}

/** Where a fresh robot starts: the scenario's square, its heading, and that square trailed. */
export function freshRobot(entry: RobotScenario): RobotState {
  return {
    x: entry.start.x,
    y: entry.start.y,
    heading: entry.start.heading,
    trail: [{ x: entry.start.x, y: entry.start.y }],
  };
}

/** A wall or the edge of the grid: the one rule movement and both sensors share. */
export function blocked(entry: RobotScenario, point: RobotPoint): boolean {
  if (point.x < 0 || point.y < 0 || point.x >= entry.cols || point.y >= entry.rows) return true;
  return entry.walls.some((wall) => wall.x === point.x && wall.y === point.y);
}

/** The square directly in front, whether or not the robot may enter it. */
export function ahead(state: RobotState): RobotPoint {
  switch (state.heading) {
    case 0:
      return { x: state.x, y: state.y - 1 };
    case 1:
      return { x: state.x + 1, y: state.y };
    case 2:
      return { x: state.x, y: state.y + 1 };
    default:
      return { x: state.x - 1, y: state.y };
  }
}

/** How many legal single steps forward come before a wall; 0 means the next square is blocked. */
export function wallDistance(entry: RobotScenario, state: RobotState): number {
  let count = 0;
  let at: RobotPoint = { x: state.x, y: state.y };
  while (count < 50) {
    const next = ahead({ ...state, x: at.x, y: at.y });
    if (blocked(entry, next)) return count;
    count += 1;
    at = next;
  }
  return count;
}

export interface RobotOutcome {
  state: RobotState;
  reply: RobotReply;
  said?: string;
  /** A movement that a wall or the edge stopped short of its requested steps. */
  blocked?: boolean;
}

/**
 * One command applied to one state.
 *
 * The input state is never mutated, and the result is returned before any animation runs: the pane
 * draws the new state and only then paces the reply, so timing can never change the outcome.
 */
export function applyCommand(
  entry: RobotScenario,
  state: RobotState,
  command: string,
  args: Record<string, unknown> = {}
): RobotOutcome {
  if (!entry.commands.includes(command as RobotCommandName)) {
    return { state, reply: { error: `'${command}' is not part of this lesson's robot API.` } };
  }
  if (command === 'move_forward') {
    const asked = Number(args.steps ?? 1);
    const steps = Number.isFinite(asked) ? Math.max(0, Math.min(20, Math.round(asked))) : 0;
    let next: RobotState = { ...state, trail: [...state.trail] };
    let moved = 0;
    while (moved < steps) {
      const target = ahead(next);
      if (blocked(entry, target)) break;
      next = { ...next, x: target.x, y: target.y };
      next.trail.push({ x: target.x, y: target.y });
      moved += 1;
    }
    return {
      state: next,
      reply: { value: moved },
      blocked: moved < steps,
    };
  }
  if (command === 'turn_right' || command === 'turn_left') {
    const delta = command === 'turn_right' ? 1 : 3;
    const heading = (((state.heading + delta) % 4) + 4) % 4 as Heading;
    return { state: { ...state, heading }, reply: { value: HEADINGS[heading] } };
  }
  if (command === 'say') {
    const said = String(args.text ?? '').slice(0, 48);
    return { state, reply: {}, said };
  }
  if (command === 'wall_ahead') {
    return { state, reply: { value: blocked(entry, ahead(state)) } };
  }
  return { state, reply: { value: wallDistance(entry, state) } };
}

/** Apply a declared walk, which is the model's own fast path — never a claim about Python. */
export function replayWalk(
  entry: RobotScenario,
  walk: readonly RobotWalkStep[]
): { state: RobotState; said?: string; blockedMoves: number } {
  let state = freshRobot(entry);
  let said: string | undefined;
  let blockedMoves = 0;
  for (const step of walk) {
    const outcome = applyCommand(entry, state, step.command, step.args ?? {});
    state = outcome.state;
    if (outcome.said !== undefined) said = outcome.said;
    if (outcome.blocked) blockedMoves += 1;
  }
  return { state, said, blockedMoves };
}

function text(value: unknown, minimum: number): boolean {
  return typeof value === 'string' && value.trim().length >= minimum;
}

function integerIn(value: unknown, low: number, high: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= low && value < high;
}

/**
 * Everything wrong with one scenario, as sentences.
 *
 * Structural checks keep a broken entry off the screen; teaching checks keep a well-formed one from
 * teaching the wrong thing. The last group replays the declared walk and compares it with
 * `expected`, so the example's promise is at least internally consistent. The browser suite is what
 * proves the actual Python example produces that same result.
 */
export function scenarioProblems(entry: RobotScenario): string[] {
  const problems: string[] = [];
  if (!text(entry.lessonId, 1)) problems.push('the lesson id is missing');
  if (!text(entry.title, 6)) problems.push('the title is too short to be useful');
  if (!text(entry.concept, 3)) problems.push('the concept is missing');
  if (!text(entry.objective, 20)) problems.push('the objective is not a sentence');
  if (!text(entry.challenge, 20)) problems.push('the challenge is not a sentence');
  if (entry.objective === entry.challenge) problems.push('the objective and challenge are the same');
  if (!integerIn(entry.cols, 3, 13) || !integerIn(entry.rows, 3, 13)) {
    problems.push('the grid must be between 3 and 12 squares on each side');
  }
  if (!integerIn(entry.start.x, 0, entry.cols) || !integerIn(entry.start.y, 0, entry.rows)) {
    problems.push('the robot starts outside the grid');
  }
  if (!integerIn(entry.target.x, 0, entry.cols) || !integerIn(entry.target.y, 0, entry.rows)) {
    problems.push('the target is outside the grid');
  }
  if (![0, 1, 2, 3].includes(entry.start.heading)) problems.push('the heading is not one of 0..3');
  const seen = new Set<string>();
  for (const wall of entry.walls) {
    const key = `${wall.x},${wall.y}`;
    if (!integerIn(wall.x, 0, entry.cols) || !integerIn(wall.y, 0, entry.rows)) {
      problems.push(`a wall at ${key} is outside the grid`);
    }
    if (seen.has(key)) problems.push(`the wall at ${key} is listed twice`);
    if (wall.x === entry.start.x && wall.y === entry.start.y) problems.push('a wall sits on the start');
    if (wall.x === entry.target.x && wall.y === entry.target.y) problems.push('a wall sits on the target');
    seen.add(key);
  }
  if (entry.commands.length === 0) problems.push('the lesson enables no robot commands');
  if (new Set(entry.commands).size !== entry.commands.length) problems.push('a command is listed twice');
  for (const command of entry.commands) {
    if (!ROBOT_COMMANDS.includes(command)) problems.push(`'${command}' is not a known command`);
  }
  const expectedPython = pythonApiSource(entry.commands);
  if (entry.python !== expectedPython) problems.push('the Python API does not match the enabled commands');
  for (const command of ROBOT_COMMANDS) {
    const defined = entry.python.includes(`def ${command}(`);
    if (entry.commands.includes(command) !== defined) {
      problems.push(`${command} is ${defined ? 'defined' : 'missing'} against its enabled state`);
    }
  }
  if (!text(entry.example, 20)) problems.push('the example is missing');
  const called = ROBOT_COMMANDS.filter((command) => entry.example.includes(`${command}(`));
  for (const command of called) {
    if (!entry.commands.includes(command)) problems.push(`the example calls disabled '${command}'`);
  }
  if (called.length < 2) problems.push('the example must use at least two enabled commands');
  if (!entry.conceptTokens.length) problems.push('the concept tokens are missing');
  for (const token of entry.conceptTokens) {
    if (!entry.example.includes(token)) problems.push(`the example never shows '${token}'`);
  }
  if (entry.modelWalk.length === 0) problems.push('the model walk is empty');
  for (const step of entry.modelWalk) {
    if (!entry.commands.includes(step.command)) problems.push(`the walk uses disabled '${step.command}'`);
  }
  for (const [name, value] of Object.entries(entry.expected.sensors ?? {})) {
    if (name === 'wall_ahead' && typeof value !== 'boolean') problems.push('wall_ahead expects a boolean');
    else if (name === 'wall_distance' && (typeof value !== 'number' || !Number.isFinite(value))) {
      problems.push('wall_distance expects a number');
    } else if (name !== 'wall_ahead' && name !== 'wall_distance') {
      problems.push(`'${name}' is not a sensor`);
    }
    if (!entry.modelWalk.some((step) => step.command === name)) {
      problems.push(`the example promises ${name} but the walk never asks it`);
    }
  }
  const first = replayWalk(entry, entry.modelWalk);
  const second = replayWalk(entry, entry.modelWalk);
  if (JSON.stringify(first) !== JSON.stringify(second)) problems.push('the walk is not deterministic');
  if (first.state.x !== entry.expected.x || first.state.y !== entry.expected.y) {
    problems.push('the walk does not end on the expected square');
  }
  if (first.state.heading !== entry.expected.heading) problems.push('the walk does not end on the expected heading');
  if (first.state.trail.length !== entry.expected.trail) problems.push('the walk does not produce the expected trail');
  if (first.said !== entry.expected.said) problems.push('the walk does not say the expected words');
  if (first.blockedMoves !== entry.expected.blockedMoves) problems.push('the walk stops at walls a different number of times');
  const onTarget = first.state.x === entry.target.x && first.state.y === entry.target.y;
  if (entry.expected.completed !== onTarget) problems.push('completion does not match the target square');
  return problems;
}
