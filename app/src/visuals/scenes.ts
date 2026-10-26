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

export type DiagramKind =
  | 'chain'
  | 'loop'
  | 'timing'
  | 'states'
  | 'bars'
  | 'route'
  | 'graph'
  | 'matrix'
  | 'bits'
  | 'reach'
  | 'schematic'
  | 'plot';

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

/** One box in a graph, and the arrow that leaves it. A graph is not a chain: it may fan out. */
export interface GraphNode {
  id: string;
  label: string;
  /** Column and row overrides; a scene that knows its shape does not leave it to the layout. */
  col?: number;
  row?: number;
  /** `accent` marks the box the page is about; the rest are context. */
  tone?: 'accent' | 'ink' | 'muted';
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

/** A grid of values: a matrix, a stackup, a byte frame, a struct's field map. */
export interface MatrixSpec {
  rows: string[];
  cols: string[];
  cells: string[][];
  /** Cells to mark: `[row, column]`, zero-based. */
  highlight?: [number, number][];
  note?: string;
}

/** A run of bits in a register, high bit to low, with the field name above it. */
export interface BitSegment {
  from: number;
  to: number;
  label: string;
  tone?: 'accent' | 'ink' | 'muted';
}

export interface BitsSpec {
  width: number;
  segments: BitSegment[];
  /** The reading under the register, e.g. `0b00101010 = 42`. */
  value?: string;
  note?: string;
}

/** A marker on a reach dial: a radius, and whether the page says it is inside the limits. */
export interface ReachPoint {
  label: string;
  at: number;
  ok?: boolean;
}

export interface ReachSpec {
  min: number;
  max: number;
  unit: string;
  points: ReachPoint[];
  note?: string;
}

export type PartKind =
  | 'source'
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'switch'
  | 'motor';

export interface CircuitPart {
  kind: PartKind;
  label: string;
  value?: string;
}

/** A two-terminal loop: parts in series, and optionally one shunt to ground after part `after`. */
export interface SchematicSpec {
  series: CircuitPart[];
  shunt?: CircuitPart & { after: number };
  note?: string;
}

export interface PlotAxis {
  label: string;
  unit?: string;
  min: number;
  max: number;
  /** A decade axis, for frequency responses and Bode plots. */
  log?: boolean;
}

export interface PlotPoint {
  x: number;
  y: number;
}

export interface PlotSeries {
  label: string;
  points: PlotPoint[];
  dashed?: boolean;
  /** Draw a dot per sample. A curve of many samples does not need them; four poles do. */
  markers?: boolean;
}

/** A shaded window on one axis: a recommended range, a deadline, a tolerance band. */
export interface PlotBand {
  label: string;
  axis: 'x' | 'y';
  from: number;
  to: number;
}

export interface PlotSpec {
  x: PlotAxis;
  y: PlotAxis;
  series: PlotSeries[];
  bands?: PlotBand[];
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
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  /** `LR` lays the levels left to right (a flow); `TD` top to bottom (a hierarchy). */
  direction?: 'LR' | 'TD';
  matrix?: MatrixSpec;
  bits?: BitsSpec;
  reach?: ReachSpec;
  schematic?: SchematicSpec;
  plot?: PlotSpec;
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

const graph = (
  title: string,
  caption: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: 'LR' | 'TD' = 'LR'
): DiagramSpec => ({ kind: 'graph', title, caption, nodes, edges, direction });

const matrix = (title: string, caption: string, spec: MatrixSpec): DiagramSpec => ({
  kind: 'matrix',
  title,
  caption,
  matrix: spec,
});

const bits = (title: string, caption: string, spec: BitsSpec): DiagramSpec => ({
  kind: 'bits',
  title,
  caption,
  bits: spec,
});

const reach = (title: string, caption: string, spec: ReachSpec): DiagramSpec => ({
  kind: 'reach',
  title,
  caption,
  reach: spec,
});

const schematic = (title: string, caption: string, spec: SchematicSpec): DiagramSpec => ({
  kind: 'schematic',
  title,
  caption,
  schematic: spec,
});

const plot = (title: string, caption: string, spec: PlotSpec): DiagramSpec => ({
  kind: 'plot',
  title,
  caption,
  plot: spec,
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

  // --- the values a programme is built from -----------------------------------------------------

  'value-types': chain(
    'Four kinds of value',
    'A whole number, a decimal, a yes/no, and text: almost every bug in a first script is one of these four in the wrong box.',
    [
      { label: 'int', value: '42' },
      { label: 'float', value: '3.5' },
      { label: 'bool', value: 'True' },
      { label: 'str', value: '“H-7”' },
    ]
  ),

  'parse-tree': graph(
    'Which operation runs first',
    'A precedence rule is a shape: the multiplication hangs below the addition, so it has to be finished first.',
    [
      { id: 'plus', label: '2 + …', row: 0, tone: 'accent' },
      { id: 'two', label: '2', row: 1 },
      { id: 'times', label: '3 × 4', row: 1 },
      { id: 'three', label: '3', row: 2 },
      { id: 'four', label: '4', row: 2 },
    ],
    [
      { from: 'plus', to: 'two' },
      { from: 'plus', to: 'times' },
      { from: 'times', to: 'three' },
      { from: 'times', to: 'four' },
    ],
    'TD'
  ),

  'decision-fork': graph(
    'One question, two roads',
    'A branch is not two behaviours: it is one comparison, and whichever road the answer chooses.',
    [
      { id: 'read', label: 'read command', row: 0 },
      { id: 'ask', label: 'above limit?', row: 1, tone: 'accent' },
      { id: 'clamp', label: 'clamp to limit', row: 2 },
      { id: 'keep', label: 'pass it through', row: 2 },
    ],
    [
      { from: 'read', to: 'ask' },
      { from: 'ask', to: 'clamp', label: 'yes' },
      { from: 'ask', to: 'keep', label: 'no' },
    ],
    'TD'
  ),

  'for-loop': loop(
    'A for loop, once around',
    'The list hands over one item, the body runs on it, and the next item is already waiting: nothing in the body decides when the loop ends.',
    [
      { label: 'next item', value: 'from the list' },
      { label: 'body', value: 'uses item' },
      { label: 'store result', value: 'append' },
      { label: 'more items?', value: 'yes' },
    ]
  ),

  'while-loop': loop(
    'A while loop, once around',
    'Here the body does decide: the condition is checked before every pass, so a body that never settles never stops.',
    [
      { label: 'check', value: 'condition' },
      { label: 'body', value: 'work' },
      { label: 'update', value: 'the state' },
    ]
  ),

  'prefix-ladder': chain(
    'The same metre, five sizes',
    'Each rung is a factor of a thousand. Reading a value is choosing a rung; converting is moving along the ladder.',
    [
      { label: 'µm', value: '10⁻⁶ m' },
      { label: 'mm', value: '10⁻³ m' },
      { label: 'm', value: '1 m' },
      { label: 'km', value: '10³ m' },
    ]
  ),

  'bit-weights': bits(
    'One byte, eight weights',
    'Each bit is worth twice the one to its right. Turn on 32, 8 and 2 and the byte reads 42.',
    {
      width: 8,
      segments: [
        { from: 7, to: 7, label: '128' },
        { from: 6, to: 6, label: '64' },
        { from: 5, to: 5, label: '32', tone: 'accent' },
        { from: 4, to: 4, label: '16' },
        { from: 3, to: 3, label: '8', tone: 'accent' },
        { from: 2, to: 2, label: '4' },
        { from: 1, to: 1, label: '2', tone: 'accent' },
        { from: 0, to: 0, label: '1' },
      ],
      value: '0b00101010 = 42',
      note: 'High bit on the left, low bit on the right: the same order a datasheet prints.',
    }
  ),

  'counts-to-degrees': plot(
    'Counts become degrees',
    'A 10-bit reading is a number from 0 to 1023. Scaling is one straight line from that range to the one the joint speaks.',
    {
      x: { label: 'raw counts', min: 0, max: 1023 },
      y: { label: 'angle', unit: '°', min: 0, max: 180 },
      series: [
        {
          label: 'angle',
          points: [
            { x: 0, y: 0 },
            { x: 256, y: 45 },
            { x: 512, y: 90 },
            { x: 768, y: 135 },
            { x: 1023, y: 180 },
          ],
          markers: true,
        },
      ],
    }
  ),

  'unit-circle-trig': plot(
    'One angle, two shadows',
    'Walk an angle around a circle and its two shadows trace a cosine and a sine: that is all the two functions are.',
    {
      x: { label: 'angle', unit: 'rad', min: 0, max: 6.3 },
      y: { label: 'shadow', min: -1, max: 1 },
      series: [
        {
          label: 'cos',
          points: Array.from({ length: 25 }, (_, index) => ({
            x: (index / 24) * 6.283,
            y: Math.cos((index / 24) * Math.PI * 2),
          })),
        },
        {
          label: 'sin',
          dashed: true,
          points: Array.from({ length: 25 }, (_, index) => ({
            x: (index / 24) * 6.283,
            y: Math.sin((index / 24) * Math.PI * 2),
          })),
        },
      ],
    }
  ),

  'torque-vs-lever': plot(
    'Where you hold it is a multiplier',
    'The same 20 N weight doubles its torque when the lever doubles. The force did not change; the arm did.',
    {
      x: { label: 'lever length', unit: 'm', min: 0, max: 0.5 },
      y: { label: 'torque', unit: 'N·m', min: 0, max: 10 },
      series: [
        {
          label: '20 N at L',
          points: [
            { x: 0, y: 0 },
            { x: 0.1, y: 2 },
            { x: 0.25, y: 5 },
            { x: 0.5, y: 10 },
          ],
          markers: true,
        },
      ],
    }
  ),

  'datasheet-window': plot(
    'A band, not a number',
    'The recommended rail is a window: the supply drifts with temperature, and the page fails where it leaves the band.',
    {
      x: { label: 'temperature', unit: '°C', min: -20, max: 80 },
      y: { label: '5 V rail', unit: 'V', min: 4.3, max: 5.6 },
      bands: [{ label: 'recommended 4.5–5.5 V', axis: 'y', from: 4.5, to: 5.5 }],
      series: [
        {
          label: 'measured',
          points: [
            { x: -20, y: 5.12 },
            { x: 0, y: 5.06 },
            { x: 25, y: 5.0 },
            { x: 50, y: 4.92 },
            { x: 70, y: 4.61 },
            { x: 80, y: 4.38 },
          ],
          markers: true,
        },
      ],
    }
  ),

  // --- power, mechanics and drives --------------------------------------------------------------

  'ldo-vs-buck': plot(
    'Two ways to lose less',
    'An LDO burns the difference as heat, so its efficiency falls with current; a buck converter stores and releases energy instead.',
    {
      x: { label: 'load current', unit: 'A', min: 0, max: 2 },
      y: { label: 'efficiency', unit: '%', min: 0, max: 100 },
      series: [
        {
          label: 'buck',
          points: [
            { x: 0.1, y: 78 },
            { x: 0.5, y: 90 },
            { x: 1, y: 92 },
            { x: 2, y: 90 },
          ],
        },
        {
          label: 'LDO 12→5 V',
          dashed: true,
          points: [
            { x: 0.1, y: 42 },
            { x: 0.5, y: 42 },
            { x: 1, y: 42 },
            { x: 2, y: 42 },
          ],
        },
      ],
    }
  ),

  'gear-torque-speed': plot(
    'A gear trades speed for torque',
    'The motor’s power is fixed; a 5:1 reduction multiplies torque by five and divides speed by five, minus the teeth you lose to friction.',
    {
      x: { label: 'output speed', unit: 'rad/s', min: 0, max: 30 },
      y: { label: 'output torque', unit: 'N·m', min: 0, max: 2 },
      series: [
        {
          label: 'direct',
          points: [
            { x: 0, y: 0.4 },
            { x: 10, y: 0.4 },
            { x: 25, y: 0.3 },
          ],
        },
        {
          label: '5:1 reduction',
          dashed: true,
          points: [
            { x: 0, y: 1.9 },
            { x: 2, y: 1.9 },
            { x: 5, y: 1.5 },
          ],
        },
      ],
    }
  ),

  'belt-drive': loop(
    'The loop a belt makes',
    'A timing belt is a closed loop: the driver pulley sets the speed, the belt carries it, and the driven pulley and load follow.',
    [
      { label: 'motor pulley', value: 'T₁, N₁' },
      { label: 'belt', value: 'same pitch' },
      { label: 'driven pulley', value: 'T₂, N₂' },
      { label: 'load', value: 'τ' },
    ]
  ),

  'three-phase': plot(
    'Three waves, one rotation',
    'The three phase currents are the same sine, offset by 120°: at every instant their sum is zero, and the field turns.',
    {
      x: { label: 'electrical angle', unit: '°', min: 0, max: 360 },
      y: { label: 'phase current', unit: 'A', min: -1, max: 1 },
      series: [
        {
          label: 'A',
          points: Array.from({ length: 13 }, (_, index) => ({
            x: (index / 12) * 360,
            y: Math.sin((index / 12) * Math.PI * 2),
          })),
        },
        {
          label: 'B',
          dashed: true,
          points: Array.from({ length: 13 }, (_, index) => ({
            x: (index / 12) * 360,
            y: Math.sin((index / 12) * Math.PI * 2 - (Math.PI * 2) / 3),
          })),
        },
        {
          label: 'C',
          dashed: true,
          points: Array.from({ length: 13 }, (_, index) => ({
            x: (index / 12) * 360,
            y: Math.sin((index / 12) * Math.PI * 2 - (Math.PI * 4) / 3),
          })),
        },
      ],
    }
  ),

  // --- data on the wire --------------------------------------------------------------------------

  'frame-layout': matrix(
    'One telemetry frame, byte by byte',
    'A receiver finds the frame by its sync byte, reads the length, then trusts the last byte: the CRC-8 covers everything before it.',
    {
      rows: ['field', 'size'],
      cols: ['sync', 'length', 'payload', 'crc8'],
      cells: [
        ['0xAA', 'u8', 'n bytes', 'checked'],
        ['1 B', '1 B', '1–32 B', '1 B'],
      ],
      highlight: [
        [0, 0],
        [0, 3],
      ],
      note: 'The header and the checksum are the two bytes a reader must never mistake for data.',
    }
  ),

  'struct-map': matrix(
    'A struct is a memory map',
    'Each field starts at an offset. `struct.pack` writes them in that order, and a reader that assumes a different order reads garbage.',
    {
      rows: ['offset', 'field'],
      cols: ['0', '2', '4', '8'],
      cells: [
        ['0', '2', '4', '8'],
        ['id u16', 'flags u16', 'x f32', 'y f32'],
      ],
      note: 'Twelve bytes here, not sixteen: two u16s fit before the first float.',
    }
  ),

  'uint8-wrap': bits(
    'What 250 + 10 does in a byte',
    'An 8-bit counter has no 260th state. The carry falls off the top and the byte reads 4: that is overflow, not a wrong calculation.',
    {
      width: 8,
      segments: [{ from: 0, to: 7, label: 'uint8_t', tone: 'accent' }],
      value: '250 + 10 → 4',
      note: 'The same wrap is why a signed byte flips from 127 to −128.',
    }
  ),

  'register-map': bits(
    'One 32-bit register, four fields',
    'A datasheet draws a register as a bitfield: the prescaler sits low, the mode above it, and the reserved bits are not yours to write.',
    {
      width: 32,
      segments: [
        { from: 0, to: 7, label: 'prescaler', tone: 'accent' },
        { from: 8, to: 11, label: 'mode' },
        { from: 12, to: 15, label: 'irq enable' },
        { from: 16, to: 31, label: 'reserved', tone: 'muted' },
      ],
      value: '0x00M0_00FF',
      note: 'Read the low bits first: a shift is a count from the right edge.',
    }
  ),

  'devicetree': graph(
    'Hardware, described as a tree',
    'Zephyr does not hunt for devices at run time: the board file names each bus and each chip on it, and the build generates the bindings.',
    [
      { id: 'soc', label: 'SoC', row: 0, tone: 'accent' },
      { id: 'i2c', label: 'i2c1', row: 1 },
      { id: 'spi', label: 'spi2', row: 1 },
      { id: 'baro', label: 'bme280', row: 2 },
      { id: 'imu', label: 'icm42688', row: 2 },
    ],
    [
      { from: 'soc', to: 'i2c' },
      { from: 'soc', to: 'spi' },
      { from: 'i2c', to: 'baro', label: '0x76' },
      { from: 'spi', to: 'imu', label: 'cs 1' },
    ],
    'TD'
  ),

  'xrce-graph': graph(
    'Two processors, one topic graph',
    'The microcontroller runs a thin client, the agent on the companion computer speaks DDS for it, and ROS 2 sees ordinary topics.',
    [
      { id: 'mcu', label: 'MCU / XRCE client', row: 0, tone: 'accent' },
      { id: 'agent', label: 'micro-ROS agent', row: 0 },
      { id: 'ros', label: 'ROS 2 graph', row: 0 },
    ],
    [
      { from: 'mcu', to: 'agent', label: 'serial' },
      { from: 'agent', to: 'ros', label: 'DDS' },
    ],
    'LR'
  ),

  // --- state, maths and estimation ---------------------------------------------------------------

  'first-order-lag': timing(
    'One pole, one approach',
    'A first-order system never arrives in finite time: each time constant closes 63% of what is left, so the last percent takes as long as the first.',
    [
      { label: 'response', points: [0, 0.63, 0.86, 0.95, 0.98, 0.99, 1, 1, 1, 1] },
      { label: '63%', points: [0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63], dashed: true },
    ],
    'time constants'
  ),

  'model-checks': states(
    'Four checks before you trust a model',
    'A model is a claim. Name the quantity, check its units, check its sign, then push it to a limit where the answer is obvious.',
    [
      { label: 'Name the quantity', note: 'what is this number?' },
      { label: 'Units cancel', note: 'kg·m/s² comes out N' },
      { label: 'Sign is physical', note: 'does it push the right way?' },
      { label: 'Limit is obvious', note: 'zero, infinity, stall' },
    ],
    ['a sentence', 'the units agree', 'the arrow is right']
  ),

  'array-shape': matrix(
    'An array is a grid with a shape',
    'Three rows and four columns is twelve numbers, and the shape is the first thing a later operation checks: a (3, 4) cannot meet a (3,) by accident.',
    {
      rows: ['row 0', 'row 1', 'row 2'],
      cols: ['col 0', 'col 1', 'col 2', 'col 3'],
      cells: [
        ['1.0', '2.0', '3.0', '4.0'],
        ['5.0', '6.0', '7.0', '8.0'],
        ['9.0', '10.0', '11.0', '12.0'],
      ],
      note: 'shape (3, 4) · axis 0 runs down the rows, axis 1 across the columns.',
    }
  ),

  'unit-cancellation': chain(
    'Carry the units through',
    'A unit is a factor. Multiply by seconds, cancel the seconds, and what is left is metres — the arithmetic checked itself.',
    [
      { label: '5 m/s', value: 'speed' },
      { label: '× 3 s', value: 'time' },
      { label: '15 m', value: 'distance' },
    ]
  ),

  'rotation-2d': matrix(
    'A rotation, written as a table',
    'Every vector is turned by the same four numbers. The columns are where the old axes land in the new frame.',
    {
      rows: ['x′', 'y′'],
      cols: ['x', 'y'],
      cells: [
        ['cos θ', '−sin θ'],
        ['sin θ', 'cos θ'],
      ],
      highlight: [
        [0, 1],
        [1, 0],
      ],
      note: 'At θ = 0 this is the identity: nothing turns, and the table says so.',
    }
  ),

  'vector-projection': plot(
    'How much of a points along b',
    'The dot product is the shadow one vector casts on another; when the shadow is zero, the two are at right angles.',
    {
      x: { label: 'x', unit: 'm', min: 0, max: 3 },
      y: { label: 'y', unit: 'm', min: 0, max: 3 },
      series: [
        {
          label: 'a',
          points: [
            { x: 0, y: 0 },
            { x: 2.4, y: 1.2 },
          ],
          markers: true,
        },
        {
          label: 'b',
          dashed: true,
          points: [
            { x: 0, y: 0 },
            { x: 2.4, y: 0 },
          ],
        },
      ],
    }
  ),

  'complex-plane': plot(
    'One number, two axes',
    'Real on the horizontal, imaginary on the vertical: multiplying by i is a quarter turn, and the unit circle is every number of size one.',
    {
      x: { label: 'real', min: -1.2, max: 1.2 },
      y: { label: 'imaginary', min: -1.2, max: 1.2 },
      series: [
        {
          label: 'unit circle',
          points: Array.from({ length: 13 }, (_, index) => ({
            x: Math.cos((index / 12) * Math.PI * 2),
            y: Math.sin((index / 12) * Math.PI * 2),
          })),
        },
      ],
    }
  ),

  'pole-zero': plot(
    'Where a system’s character lives',
    'Poles on the left settle; poles on the right grow. A pole pair off the real axis is what rings at one frequency.',
    {
      x: { label: 'real', unit: '1/s', min: -10, max: 2 },
      y: { label: 'imaginary', unit: 'rad/s', min: -6, max: 6 },
      series: [
        {
          label: 'poles',
          points: [
            { x: -2, y: 3 },
            { x: -2, y: -3 },
            { x: -8, y: 0 },
          ],
          markers: true,
        },
        {
          label: 'zeros',
          dashed: true,
          points: [{ x: 0, y: 0 }],
          markers: true,
        },
      ],
    }
  ),

  'state-vector': matrix(
    'Two numbers that move together',
    'Position and velocity are one state, not two facts: the tick that changes one changes the other.',
    {
      rows: ['x', 'v'],
      cols: ['now'],
      cells: [['0.30 m'], ['0.00 m/s']],
      note: 'The pair is the whole memory the next tick needs.',
    }
  ),

  'state-update': matrix(
    'One tick, written as a product',
    'The matrix holds the rule; the vector holds the state. Multiply them and the next state falls out, whatever the numbers are today.',
    {
      rows: ['x′', 'v′'],
      cols: ['x', 'v'],
      cells: [
        ['1', 'Δt'],
        ['0', '1'],
      ],
      highlight: [
        [0, 1],
      ],
      note: 'x′ = x + Δt·v, v′ = v: the one nonzero off-diagonal is the integration.',
    }
  ),

  'homogeneous': matrix(
    'One matrix, a rotation and a shift',
    'A 4×4 transform keeps the rotation in its top-left corner and the translation in its last column, so one product composes both.',
    {
      rows: ['x', 'y', 'z', '1'],
      cols: ['x', 'y', 'z', '1'],
      cells: [
        ['r11', 'r12', 'r13', 'px'],
        ['r21', 'r22', 'r23', 'py'],
        ['r31', 'r32', 'r33', 'pz'],
        ['0', '0', '0', '1'],
      ],
      highlight: [
        [0, 3],
        [1, 3],
        [2, 3],
      ],
      note: 'The bottom row is always 0 0 0 1: it is what makes the shift a multiplication.',
    }
  ),

  'twist-vector': matrix(
    'Six numbers, one motion',
    'A twist packs angular velocity above linear velocity. The screw axis is the line the body turns about while it slides along it.',
    {
      rows: ['ωx', 'ωy', 'ωz', 'vx', 'vy', 'vz'],
      cols: ['twist'],
      cells: [['0.0'], ['0.0'], ['1.2'], ['0.0'], ['0.4'], ['0.0']],
      highlight: [
        [2, 0],
        [4, 0],
      ],
      note: 'Angular part in rad/s, linear part in m/s: mixing the two units is the classic SE(3) bug.',
    }
  ),

  'dq-coupling': matrix(
    'The cross terms a decoupler cancels',
    'In the rotor frame the two axes are not independent: current on d pushes voltage on q, and the other way round. The terms carry ωL.',
    {
      rows: ['vd', 'vq'],
      cols: ['id', 'iq'],
      cells: [
        ['R', '−ωL'],
        ['ωL', 'R'],
      ],
      highlight: [
        [0, 1],
        [1, 0],
      ],
      note: 'At standstill ω is zero, the off-diagonals vanish, and the two loops look independent.',
    }
  ),

  'rotation-3d': matrix(
    'Rotating about one axis',
    'A 3×3 rotation about z leaves the third row and column alone: the plane that does not move is the axis.',
    {
      rows: ['x′', 'y′', 'z′'],
      cols: ['x', 'y', 'z'],
      cells: [
        ['cos θ', '−sin θ', '0'],
        ['sin θ', 'cos θ', '0'],
        ['0', '0', '1'],
      ],
      highlight: [[2, 2]],
      note: 'Composing two rotations is two matrix products, in order: they do not commute.',
    }
  ),

  'notch-response': plot(
    'A notch is a hole in the gain',
    'The biquad is tuned to cut one frequency and leave its neighbours alone; pre-warping is what keeps the hole on the mains hum.',
    {
      x: { label: 'frequency', unit: 'Hz', min: 10, max: 1000, log: true },
      y: { label: 'gain', unit: 'dB', min: -40, max: 5 },
      series: [
        {
          label: 'notch',
          points: [
            { x: 10, y: 0 },
            { x: 30, y: -1 },
            { x: 45, y: -20 },
            { x: 50, y: -38 },
            { x: 55, y: -20 },
            { x: 80, y: -2 },
            { x: 200, y: 0 },
            { x: 1000, y: 0 },
          ],
        },
      ],
    }
  ),

  'safety-filter': plot(
    'The request, and the safe request',
    'A barrier function turns a limit into a bound on the command. Where the request would cross it, the filter returns the largest command that will not.',
    {
      x: { label: 'time', unit: 's', min: 0, max: 2 },
      y: { label: 'acceleration', unit: 'm/s²', min: -1, max: 4 },
      bands: [{ label: 'safe set', axis: 'y', from: -1, to: 3 }],
      series: [
        {
          label: 'requested',
          dashed: true,
          points: [
            { x: 0, y: 0.5 },
            { x: 0.6, y: 2.0 },
            { x: 1.0, y: 3.6 },
            { x: 1.4, y: 2.2 },
            { x: 2.0, y: 0.4 },
          ],
        },
        {
          label: 'filtered',
          points: [
            { x: 0, y: 0.5 },
            { x: 0.6, y: 2.0 },
            { x: 1.0, y: 3.0 },
            { x: 1.4, y: 2.2 },
            { x: 2.0, y: 0.4 },
          ],
        },
      ],
    }
  ),

  // --- systems, software and the bench ------------------------------------------------------------

  'ros-graph': graph(
    'A robot is a graph of topics',
    'Each box is a process and each arrow is a typed message. Nothing calls anything directly: the graph is the contract.',
    [
      { id: 'cam', label: 'camera', row: 0 },
      { id: 'det', label: 'detector', row: 0, tone: 'accent' },
      { id: 'plan', label: 'planner', row: 0 },
      { id: 'motors', label: 'motors', row: 0 },
    ],
    [
      { from: 'cam', to: 'det', label: '/image' },
      { from: 'det', to: 'plan', label: '/target' },
      { from: 'plan', to: 'motors', label: '/cmd' },
    ],
    'LR'
  ),

  'launch-tree': graph(
    'One launch file, many nodes',
    'Launch files are the map of a running system: which nodes start, in what order, and with which parameters.',
    [
      { id: 'launch', label: 'bringup.launch.py', row: 0, tone: 'accent' },
      { id: 'sensors', label: 'sensors', row: 1 },
      { id: 'control', label: 'control', row: 1 },
      { id: 'bring', label: 'state publisher', row: 1 },
    ],
    [
      { from: 'launch', to: 'sensors', label: 'params' },
      { from: 'launch', to: 'control', label: 'params' },
      { from: 'launch', to: 'bring', label: 'urdf' },
    ],
    'TD'
  ),

  'autograd-graph': graph(
    'The graph autograd walks back',
    'The forward pass builds a chain of operations; the backward pass applies one derivative per arrow, all the way to the parameter.',
    [
      { id: 'x', label: 'x', row: 0 },
      { id: 'w', label: 'w', row: 0 },
      { id: 'prod', label: 'w · x', row: 0, tone: 'accent' },
      { id: 'loss', label: 'loss', row: 0 },
      { id: 'grad', label: '∂L/∂w', row: 0 },
    ],
    [
      { from: 'x', to: 'prod', label: '×' },
      { from: 'w', to: 'prod', label: '×' },
      { from: 'prod', to: 'loss', label: '−y' },
      { from: 'loss', to: 'grad', label: 'back' },
    ],
    'LR'
  ),

  'rl-loop': loop(
    'The loop a policy learns in',
    'The agent sees a state, chooses an action, and the world answers with a reward and a new state: the reward is the only teacher.',
    [
      { label: 'state', value: 's' },
      { label: 'policy', value: 'π(a|s)' },
      { label: 'action', value: 'a' },
      { label: 'reward', value: 'r' },
    ]
  ),

  'asset-model': graph(
    'A factory, described as a tree',
    'An asset administration shell is an addressable tree: the server holds folders, the folders hold assets, and each asset holds properties with units.',
    [
      { id: 'server', label: 'OPC UA server', row: 0, tone: 'accent' },
      { id: 'folder', label: 'Machine #7', row: 1 },
      { id: 'asset', label: 'Arm asset', row: 2 },
      { id: 'props', label: 'Nameplate', row: 3 },
    ],
    [
      { from: 'server', to: 'folder' },
      { from: 'folder', to: 'asset' },
      { from: 'asset', to: 'props', label: 'AAS' },
    ],
    'TD'
  ),

  'latency-budget': bars(
    'Where the millisecond goes',
    'A control period is a budget. Every stage spends part of it, and the one nobody measured is the one that overruns the deadline.',
    [
      { label: 'sense', value: 40, max: 200 },
      { label: 'filter', value: 15, max: 200 },
      { label: 'control', value: 25, max: 200 },
      { label: 'comm', value: 60, max: 200 },
      { label: 'actuate', value: 20, max: 200 },
    ]
  ),

  'precharge-inrush': plot(
    'A capacitor is a short circuit at t = 0',
    'The empty bus cap takes whatever current the supply can give. A series resistor turns that spike into a ramp you can survive.',
    {
      x: { label: 'time', unit: 'ms', min: 0, max: 50 },
      y: { label: 'bus current', unit: 'A', min: 0, max: 20 },
      series: [
        {
          label: 'direct',
          points: [
            { x: 0, y: 18 },
            { x: 1, y: 9 },
            { x: 5, y: 3 },
            { x: 20, y: 0.5 },
            { x: 50, y: 0 },
          ],
        },
        {
          label: '10 Ω precharge',
          dashed: true,
          points: [
            { x: 0, y: 2.4 },
            { x: 10, y: 2.1 },
            { x: 25, y: 1.4 },
            { x: 40, y: 0.9 },
            { x: 50, y: 0.7 },
          ],
        },
      ],
    }
  ),

  'rc-charge': schematic(
    'One resistor, one capacitor',
    'The resistor sets how fast the capacitor fills, and the product RC is the time constant: at one of them the cap is 63% charged.',
    {
      series: [
        { kind: 'source', label: '5 V', value: 'DC' },
        { kind: 'resistor', label: 'R', value: '10 kΩ' },
        { kind: 'capacitor', label: 'C', value: '100 µF' },
      ],
      note: 'τ = R·C = 1.0 s here: the cap is within a percent after five of them.',
    }
  ),

  'brake-chopper': schematic(
    'Where the braking energy goes',
    'A regenerating motor pushes current back into the bus. The chopper closes a switch onto a resistor and burns what the supply cannot take.',
    {
      series: [
        { kind: 'source', label: '24 V bus', value: 'supply' },
        { kind: 'resistor', label: 'R brake', value: '5 Ω' },
      ],
      shunt: { after: 1, kind: 'switch', label: 'MOSFET', value: '> 27.5 V' },
      note: 'A bench supply has a diode at its output: it can source current and cannot sink it.',
    }
  ),

  'stackup': matrix(
    'Six layers, and what each one is for',
    'A stackup is a plan for where the return current flows. Putting a ground plane under every signal layer is what keeps the loop small.',
    {
      rows: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
      cols: ['layer', 'role'],
      cells: [
        ['signal', 'high-speed'],
        ['ground', 'return'],
        ['signal', 'high-speed'],
        ['power', 'planes'],
        ['ground', 'return'],
        ['signal', 'slow'],
      ],
      highlight: [
        [1, 0],
        [4, 0],
      ],
      note: 'The two ground planes are never adjacent: that would waste one.',
    }
  ),

  'torque-vs-angle': plot(
    'Gravity torque is a cosine',
    'A link held straight out has the most lever arm; held straight up it has none. The torque is the weight times that arm.',
    {
      x: { label: 'link angle from horizontal', unit: '°', min: 0, max: 180 },
      y: { label: 'gravity torque', unit: 'N·m', min: -2, max: 2 },
      series: [
        {
          label: 'm·g·L·cos θ',
          points: [
            { x: 0, y: 1.8 },
            { x: 45, y: 1.27 },
            { x: 90, y: 0 },
            { x: 135, y: -1.27 },
            { x: 180, y: -1.8 },
          ],
        },
      ],
    }
  ),

  'loop-spike': plot(
    'The loop inductance is the spike',
    'A MOSFET turns off in nanoseconds, so the current keeps going through the loop. The smaller the loop, the smaller the volts it costs.',
    {
      x: { label: 'di/dt', unit: 'A/ns', min: 0, max: 4 },
      y: { label: 'drain-source peak', unit: 'V', min: 40, max: 150 },
      bands: [{ label: '80 V rating', axis: 'y', from: 40, to: 80 }],
      series: [
        {
          label: '6-layer, 0.16 nH',
          points: [
            { x: 0, y: 48 },
            { x: 1, y: 48.2 },
            { x: 2, y: 48.3 },
            { x: 3, y: 48.5 },
            { x: 4, y: 48.6 },
          ],
        },
        {
          label: '2-layer, 25 nH',
          dashed: true,
          points: [
            { x: 0, y: 48 },
            { x: 1, y: 73 },
            { x: 2, y: 98 },
            { x: 3, y: 123 },
            { x: 4, y: 148 },
          ],
        },
      ],
    }
  ),

  'group-delay': plot(
    'Two traces, two delays',
    'A microstrip and a stripline carry the same edge at different speeds. Group delay is that difference, measured across the band the signal occupies.',
    {
      x: { label: 'frequency', unit: 'MHz', min: 1, max: 1000, log: true },
      y: { label: 'group delay', unit: 'ps', min: 100, max: 180 },
      series: [
        {
          label: 'microstrip, L1',
          points: [
            { x: 1, y: 152 },
            { x: 10, y: 155 },
            { x: 100, y: 161 },
            { x: 500, y: 168 },
            { x: 1000, y: 173 },
          ],
        },
        {
          label: 'stripline, L3',
          dashed: true,
          points: [
            { x: 1, y: 138 },
            { x: 10, y: 139 },
            { x: 100, y: 140 },
            { x: 500, y: 142 },
            { x: 1000, y: 144 },
          ],
        },
      ],
    }
  ),

  'reach-window': reach(
    'The ring the arm can reach',
    'Two limits, not one: the outer circle is the arm’s length, and the inner one is what the folded elbow cannot come back into.',
    {
      min: 0.1,
      max: 0.5,
      unit: 'm',
      points: [
        { label: 'parked', at: 0.16, ok: true },
        { label: 'mid', at: 0.3, ok: true },
        { label: 'straight', at: 0.5, ok: true },
        { label: 'too close', at: 0.05, ok: false },
      ],
      note: 'A target outside the ring has a solution on paper and none the hardware can take.',
    }
  ),
};

export const SCENE_IDS: string[] = Object.keys(SCENES).sort();

/** A scene by name, or null: an unknown id is the caller's problem to show, never a silent blank. */
export function sceneFor(id: string): DiagramSpec | null {
  return SCENES[id] ?? null;
}
