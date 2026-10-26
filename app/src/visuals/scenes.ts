/**
 * The pictures the course draws (`app/src/visuals/scenes.ts`).
 *
 * A lesson page is a wall of paragraphs and a table; the same page with the chain it describes drawn
 * above the paragraphs is a page a beginner can *see*. So the app keeps a small library of named
 * scenes, and a page asks for one by name (`<!-- figure: control-loop | … -->`, parsed by
 * `scripts/generate_lesson_pages.py` and rendered by `components/LessonReader.tsx`).
 *
 * Named rather than inline for two reasons: a figure used by three lessons is one definition that
 * cannot drift, and the whole library is data, so `scripts/test_visuals.mjs` can prove every scene
 * names something real and that every id a committed page asks for exists here.
 *
 * There is no drawing code in this file. `Diagram.tsx` renders a spec; this is only what a scene *is*.
 */

export type DiagramKind = 'chain' | 'loop' | 'timing' | 'states' | 'bars' | 'route';

/** One box in a chain or a loop. `value` is the instrument reading under the label, if there is one. */
export interface Stage {
  label: string;
  /** The instrument reading under the label: a unit, a formula, a number. */
  value?: string;
  /** A second line, used by the state figures for the proof each gate needs. */
  note?: string;
}

/** A named curve on a timing figure. Values are in the figure's own unit, normalized at draw time. */
export interface Series {
  label: string;
  points: number[];
  dashed?: boolean;
}

export interface DiagramSpec {
  kind: DiagramKind;
  /** The figure's own heading: what the picture is, in three or four words. */
  title: string;
  /** One line under the picture. Never a paragraph — the prose below it is the paragraph. */
  caption: string;
  stages?: Stage[];
  /** One gate label per state, printed on the arrow that leaves it. */
  transitions?: string[];
  series?: Series[];
  bars?: { label: string; value: number; max: number }[];
  /**
   * A route's steps, top to bottom. Not a named scene: a route is a page's own linear
   * `flowchart`, parsed by `scripts/generate_lesson_pages.py` into the payload, because 170 pages
   * already carry one and dropping it left the reader with the prose and no map.
   */
  steps?: string[];
  /** The timing figures' y-axis unit, printed in the corner. */
  unit?: string;
}

const chain = (title: string, caption: string, stages: Stage[]): DiagramSpec => ({
  kind: 'chain',
  title,
  caption,
  stages,
});

const loop = (title: string, caption: string, stages: Stage[]): DiagramSpec => ({
  kind: 'loop',
  title,
  caption,
  stages,
});

const timing = (title: string, caption: string, series: Series[], unit: string): DiagramSpec => ({
  kind: 'timing',
  title,
  caption,
  series,
  unit,
});

const states = (title: string, caption: string, stages: Stage[], transitions: string[]): DiagramSpec => ({
  kind: 'states',
  title,
  caption,
  stages,
  transitions,
});

const bars = (title: string, caption: string, values: { label: string; value: number; max: number }[]): DiagramSpec => ({
  kind: 'bars',
  title,
  caption,
  bars: values,
});

/** A square wave, for the encoder figure: `on` samples high, the rest low. */
function square(periods: number, duty: number, offset: number, samples = 96): number[] {
  return Array.from({ length: samples }, (_, index) => {
    const phase = (index / samples) * periods + offset;
    return phase - Math.floor(phase) < duty ? 1 : 0;
  });
}

export const SCENES: Record<string, DiagramSpec> = {
  'signal-chain': chain(
    'Signal chain',
    'One direction only: the sensor reads, the filter cleans, the controller decides, the motor acts.',
    [
      { label: 'Sensor', value: 'q, q̇' },
      { label: 'Filter', value: 'noise ↓' },
      { label: 'Controller', value: 'u = K·e' },
      { label: 'Motor', value: 'τ' },
      { label: 'Arm', value: 'motion' },
    ]
  ),

  'power-chain': chain(
    'Power chain',
    'Every stage costs volts and amps; the rail that browns out first is the one that sets the limit.',
    [
      { label: 'Supply', value: '12 V' },
      { label: 'Buck', value: '5 V' },
      { label: 'H-bridge', value: 'PWM' },
      { label: 'Motor', value: '1.2 A' },
      { label: 'Encoder', value: '3.3 V' },
    ]
  ),

  'control-loop': loop(
    'The closed loop',
    'Error in, effort out, measurement back. Every gain you tune moves the same three arrows.',
    [
      { label: 'Error', value: 'e = r − y' },
      { label: 'Controller', value: 'u' },
      { label: 'Plant', value: 'arm' },
      { label: 'Sensor', value: 'y' },
    ]
  ),

  'bring-up': states(
    'Safe bring-up',
    'Each state is a gate: the next one is not entered until its proof is in.',
    [
      { label: 'Power off', note: 'check wiring' },
      { label: 'Rails up', note: 'measure 3.3 / 5 / 12' },
      { label: 'Current limit', note: 'set to stall × 0.3' },
      { label: 'Open loop', note: 'sine sweep' },
      { label: 'Closed loop', note: 'gains from sweep' },
    ],
    ['meter says OK', 'limit set', 'sweep logged', 'stable at all amps']
  ),

  'encoder-timing': timing(
    'Quadrature, as edges',
    'Two channels a quarter cycle apart: the order of the edges is the direction, and the count is the angle.',
    [
      { label: 'A', points: square(4, 0.5, 0) },
      { label: 'B', points: square(4, 0.5, 0.25), dashed: true },
      { label: 'Index', points: square(1, 0.06, 0.02) },
    ],
    'edges'
  ),

  'step-response': timing(
    'Same motor, three tunings',
    'Underdamped rings, critically damped arrives, overdamped is late. The plant never changed.',
    [
      { label: 'ζ 0.25', points: [0, 0.6, 1.25, 1.38, 1.06, 0.86, 0.94, 1.03, 1.0, 1.0] },
      { label: 'ζ 1.0', points: [0, 0.35, 0.72, 0.92, 0.99, 1.0, 1.0, 1.0, 1.0, 1.0] },
      { label: 'ζ 2.0', points: [0, 0.16, 0.32, 0.48, 0.62, 0.74, 0.84, 0.92, 0.97, 1.0], dashed: true },
    ],
    'position'
  ),

  'loop-timing': timing(
    'Deadline or jitter',
    'The loop is real-time when every pass finishes before the next tick, not when the average does.',
    [
      { label: 'work', points: [0.42, 0.46, 0.44, 0.4, 0.78, 0.47, 0.45, 0.43, 0.46, 0.44] },
      { label: 'deadline', points: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], dashed: true },
    ],
    'period'
  ),

  'sensor-fusion': chain(
    'Two sensors, one attitude',
    'The gyro is smooth and drifts; the accelerometer is noisy and absolute. The filter trusts each for what it is good at.',
    [
      { label: 'Gyro', value: 'ω' },
      { label: 'Integrate', value: 'θ_g' },
      { label: 'Blend', value: 'α' },
      { label: 'Accel', value: 'g' },
      { label: 'Attitude', value: 'θ' },
    ]
  ),

  'arm-kinematics': chain(
    'From angles to a point',
    'Forward kinematics is two rotations and one addition. Inverse kinematics walks the same path backwards.',
    [
      { label: 'q₁, q₂', value: 'joints' },
      { label: 'FK', value: 'L₁, L₂' },
      { label: 'Tip', value: 'x, y' },
      { label: 'Plan', value: 'path' },
      { label: 'IK', value: 'q₁, q₂' },
    ]
  ),

  trajectory: timing(
    'Cubic move, two curves',
    'Position arrives on an S-curve and velocity is its slope: zero at both ends, so no step in force.',
    [
      { label: 'position', points: [0, 0.0, 0.03, 0.11, 0.26, 0.45, 0.63, 0.81, 0.94, 1.0] },
      { label: 'velocity', points: [0, 0.0, 0.08, 0.24, 0.4, 0.48, 0.4, 0.24, 0.08, 0.0] },
    ],
    'time'
  ),

  'fault-cost': bars(
    'Where the time goes',
    'A fault found on the bench costs minutes; the same fault found at the expo costs the demo.',
    [
      { label: 'Bench, unpowered', value: 2, max: 60 },
      { label: 'Bench, powered', value: 12, max: 60 },
      { label: 'On demo night', value: 55, max: 60 },
    ]
  ),

  'water-analogy': chain(
    'Pressure, pipe, flow',
    'Voltage is the push, resistance is the pipe, current is what actually moves. The analogy stops at heat, and the page says where.',
    [
      { label: 'Pump', value: 'volts' },
      { label: 'Pipe', value: 'ohms' },
      { label: 'Flow', value: 'amps' },
      { label: 'Load', value: 'watts' },
    ]
  ),

  'motion-chain': chain(
    'One number, three rates',
    'Position differentiates into velocity and again into acceleration; the page runs the same chain backwards by accumulating samples.',
    [
      { label: 'Position', value: 'q' },
      { label: 'd/dt', value: 'Δq / Δt' },
      { label: 'Velocity', value: 'q̇' },
      { label: 'd/dt', value: 'Δq̇ / Δt' },
      { label: 'Accel', value: 'q̈' },
    ]
  ),

  'debug-loop': loop(
    'The loop you actually run',
    'Run, read the last line of the traceback, change one thing, run again. Skipping the reading step is what turns one bug into four.',
    [
      { label: 'Run', value: 'one change' },
      { label: 'Read error', value: 'last line' },
      { label: 'Locate', value: 'the line' },
      { label: 'Edit', value: 'one thing' },
    ]
  ),

  'toolchain': chain(
    'From file to proof',
    'A script on disk proves nothing until it has run, and it is not done until something checks what it printed.',
    [
      { label: 'Write', value: '.py' },
      { label: 'Run', value: 'python3' },
      { label: 'Check', value: 'assert' },
      { label: 'Commit', value: 'git' },
    ]
  ),

  'aliasing': timing(
    'Sampled too slowly',
    'The smooth wave is the signal; the marked samples are the only thing the loop ever sees, so it reports a slower wave that is not there.',
    [
      {
        label: 'signal',
        points: Array.from({ length: 40 }, (_, index) => Math.sin((index / 40) * Math.PI * 4)),
      },
      { label: 'samples', points: [0, 0.97, -0.97, 0.97, -0.97, 0.97, -0.97, 0.97, 0] },
    ],
    'time'
  ),

  'bode-margins': timing(
    'Gain and phase over frequency',
    'Magnitude falling through unity is the crossover; the phase left at that point is the margin that decides whether the loop rings.',
    [
      { label: '|L|', points: [1.0, 0.83, 0.6, 0.38, 0.22, 0.12, 0.06, 0.03, 0.015] },
      { label: '∠L', points: [0, 0.18, 0.42, 0.72, 1.05, 1.4, 1.7, 1.9, 2.0], dashed: true },
    ],
    'log ω'
  ),

  'clarke-park': chain(
    'Three phases to one frame',
    'Clarke turns three measured currents into two, Park turns those into the rotor’s own frame, and there the steady state is a constant.',
    [
      { label: 'i abc', value: '3 wires' },
      { label: 'Clarke', value: 'α, β' },
      { label: 'Park', value: 'θe' },
      { label: 'i dq', value: 'DC' },
      { label: 'Control', value: 'u dq' },
    ]
  ),

  'isr-layers': chain(
    'Interrupt to output',
    'The ISR only captures and sets a flag; the main loop does the thinking, so a slow calculation cannot miss the next edge.',
    [
      { label: 'Hardware', value: 'tick' },
      { label: 'ISR', value: 'capture' },
      { label: 'Flag', value: 'volatile' },
      { label: 'Main loop', value: 'compute' },
      { label: 'Output', value: 'PWM' },
    ]
  ),

  'kalman-step': chain(
    'Predict, then correct',
    'The model moves the estimate and its uncertainty forward; the measurement pulls it back by the gain, and the covariance shrinks by what was learned.',
    [
      { label: 'Predict', value: 'A x + B u' },
      { label: 'Innovate', value: 'z − H x' },
      { label: 'Gain', value: 'K' },
      { label: 'Update', value: 'x⁺, P⁺' },
    ]
  ),

  'pwm-adc': timing(
    'Sample where the duty is quiet',
    'A centre-aligned carrier puts the switching edge at both ends of the period, so the midpoint is the one instant the current is not ringing.',
    [
      { label: 'carrier', points: [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0] },
      { label: 'ADC trigger', points: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], dashed: true },
    ],
    'one PWM period'
  ),
};

export const SCENE_IDS: string[] = Object.keys(SCENES).sort();

/** A scene by name, or null: an unknown id is the caller's problem to show, never a silent blank. */
export function sceneFor(id: string): DiagramSpec | null {
  return SCENES[id] ?? null;
}
