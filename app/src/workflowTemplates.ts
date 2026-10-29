/**
 * The workflow templates a learner can start from (`app/src/workflowTemplates.ts`).
 *
 * A blank diagram is a good tool and a bad first screen: a beginner who has never had to say what
 * the unknowns are will draw a box labelled "calculate". These templates are not worked answers — the
 * numbers are the ones the lesson uses, and the text is written so the empty parts are the parts the
 * learner has to decide. Each one is a `WorkflowDoc` with its cards already in the order a person
 * would solve the problem, so the first press produces something to edit rather than something to
 * invent.
 *
 * `templateForLesson` is the one lesson-aware join: P.15 teaches the motor-stall flow, so its tab
 * opens with that example ready. Every other lesson's tab opens on the empty state, which offers the
 * same templates without pretending one of them is that lesson's answer.
 */

import {
  WORKFLOW_VERSION,
  autoNodePosition,
  type StepKind,
  type WorkflowDoc,
  type WorkflowEdge,
  type WorkflowMode,
  type WorkflowNode,
} from './workflow.ts';

export interface WorkflowTemplate {
  id: string;
  mode: WorkflowMode;
  name: string;
  /** One sentence under the name in the picker. */
  blurb: string;
  build: () => WorkflowDoc;
}

/** A template card before ids and positions exist; `branch` becomes a labelled arrow. */
interface TemplateStep {
  kind: StepKind;
  title: string;
  detail: string;
  unit?: string;
  branch?: { when: string; to: string };
}

/**
 * A template as a canvas: the cards laid out two per row, and one arrow between each card and the
 * next, plus an arrow wherever the card names a branch. A template that opened as a pile of cards
 * with no arrows would teach the wrong thing about a graph.
 */
function flow(
  mode: WorkflowMode,
  title: string,
  steps: TemplateStep[],
  now: number = Date.now()
): WorkflowDoc {
  const nodes: WorkflowNode[] = steps.map(({ kind, title: cardTitle, detail, unit }, index) => ({
    id: `s${index + 1}`,
    kind,
    title: cardTitle,
    detail,
    ...(unit ? { unit } : {}),
    ...autoNodePosition(index),
  }));
  const edges: WorkflowEdge[] = [];
  for (const [index, step] of steps.entries()) {
    const from = `s${index + 1}`;
    const next = nodes[index + 1];
    if (next) edges.push({ id: `e${edges.length + 1}`, from, to: next.id });
    const branch = step.branch;
    if (!branch) continue;
    const already = edges.some((edge) => edge.from === from && edge.to === branch.to);
    if (branch.to === from || already || !nodes.some((node) => node.id === branch.to)) continue;
    edges.push({
      id: `e${edges.length + 1}`,
      from,
      to: branch.to,
      ...(branch.when ? { label: branch.when } : {}),
    });
  }
  return { version: WORKFLOW_VERSION, mode, title, nodes, edges, updatedAt: now };
}

const motorStall: WorkflowTemplate = {
  id: 'motor-stall',
  mode: 'analysis',
  name: 'Winding draw vs the driver limit',
  blurb: 'Division at standstill, then the driver’s limit — the check changes the answer.',
  build: () =>
    flow('analysis', 'Winding draw vs the driver limit', [
      {
        kind: 'given',
        title: 'Supply and winding',
        detail: '12.0 V supply, 2.4 ohm winding, motor at standstill',
        unit: 'V, ohm',
      },
      {
        kind: 'unknown',
        title: 'Draw at standstill',
        detail: 'the draw at zero speed, before the driver limits it',
        unit: 'A',
      },
      { kind: 'model', title: 'The relation at standstill', detail: 'I = V / R' },
      { kind: 'compute', title: 'Divide', detail: '12.0 / 2.4 = 5.00', unit: 'A' },
      {
        kind: 'check',
        title: 'Against the driver peak',
        detail: '5.00 A > 3.20 A peak -> over the limit',
        unit: 'A',
      },
      {
        kind: 'answer',
        title: 'State the result and the fix',
        detail: 'limit to 3.2 A or fit a driver rated for 5 A continuous',
        unit: 'A',
      },
    ]),
};

const sensorScale: WorkflowTemplate = {
  id: 'sensor-scale',
  mode: 'analysis',
  name: 'Sensor scaling and range check',
  blurb: 'ADC counts to volts to engineering units, with the divider as the model.',
  build: () =>
    flow('analysis', 'Sensor scaling and range check', [
      {
        kind: 'given',
        title: 'Datasheet numbers',
        detail: '10-bit ADC, 3.3 V reference, equal 10 k divider',
        unit: 'bit, V, ohm',
      },
      { kind: 'unknown', title: 'Sensor voltage', detail: 'the voltage at the ADC pin', unit: 'V' },
      {
        kind: 'model',
        title: 'Two stages',
        detail: 'V_adc = code / 2^bits * Vref; V_sensor = V_adc * (R1 + R2) / R2',
      },
      { kind: 'compute', title: 'At mid-scale', detail: 'code 512 -> 1.65 V at the pin', unit: 'V' },
      {
        kind: 'check',
        title: 'Inside the ADC range',
        detail: '3.30 V <= 3.3 V reference -> at the rail, no headroom left',
        unit: 'V',
      },
      {
        kind: 'answer',
        title: 'Report the reading',
        detail: '512 counts = 3.30 V at the sensor; a full-scale sensor clips',
        unit: 'V',
      },
    ]),
};

const pidLimits: WorkflowTemplate = {
  id: 'pid-limits',
  mode: 'analysis',
  name: 'PID step response and saturation',
  blurb: 'Peak and overshoot, then whether the command can actually be delivered.',
  build: () =>
    flow('analysis', 'PID step response and saturation', [
      {
        kind: 'given',
        title: 'Loop and supply',
        detail: 'Kp 2.0, Ki 8.0, 12 V supply, motor stalls at 5 A',
        unit: 'V, A',
      },
      {
        kind: 'unknown',
        title: 'Overshoot and peak command',
        detail: 'how far past the setpoint, and how much voltage that asks for',
        unit: 'deg, V',
      },
      {
        kind: 'model',
        title: 'Closed loop as second order',
        detail: 'wn = sqrt(Ki); zeta = Kp / (2 * wn)',
      },
      { kind: 'compute', title: 'Peak from zeta', detail: 'zeta 0.35 -> overshoot ~30%', unit: '%' },
      {
        kind: 'check',
        title: 'Command stays under the supply',
        detail: 'peak command 14 V > 12 V -> it saturates and the integral winds up',
        unit: 'V',
      },
      {
        kind: 'answer',
        title: 'Detune or add anti-windup',
        detail: 'lower Kp to 1.2 and clamp the integral term',
        unit: 'V',
      },
    ]),
};

const functionFromExamples: WorkflowTemplate = {
  id: 'function-from-examples',
  mode: 'code',
  name: 'Write a function from examples',
  blurb: 'Signature, the two cases that pin the behaviour, the body, the test.',
  build: () =>
    flow('code', 'Write a function from examples', [
      {
        kind: 'input',
        title: 'Signature and examples',
        detail: 'def wheel_turns(distance_m, circumference_m) -> float; (1.0, 0.5) -> 2.0',
      },
      { kind: 'transform', title: 'Implement the body', detail: 'return distance_m / circumference_m' },
      {
        kind: 'test',
        title: 'Check both examples',
        detail: 'assert wheel_turns(1.0, 0.5) == 2.0; assert wheel_turns(0.0, 0.5) == 0.0',
      },
      { kind: 'output', title: 'Print once', detail: 'print(wheel_turns(3.0, 0.5)) -> 6.0' },
    ]),
};

const debugFailingRun: WorkflowTemplate = {
  id: 'debug-failing-run',
  mode: 'code',
  name: 'Debug a failing run',
  blurb: 'The exact failure, a reproduction, a probe, and the fix that explains it.',
  build: () =>
    flow('code', 'Debug a failing run', [
      {
        kind: 'input',
        title: 'The exact failure',
        detail: 'AssertionError: 4.0 != 5.0 at line 14 — copy it, do not paraphrase',
      },
      {
        kind: 'transform',
        title: 'Reproduce it in one run',
        detail: 'same lesson, same input, press Run — a second guess is not a reproduction',
      },
      {
        kind: 'branch',
        title: 'Every run, or only some?',
        detail: 'if it repeats, the probe is worth arming',
        branch: { when: 'reproduces every time', to: 's4' },
      },
      {
        kind: 'test',
        title: 'One assertion at the boundary',
        detail: 'assert stall_current(12.0) == 5.0 — the smallest case that fails',
      },
      {
        kind: 'output',
        title: 'Say why, not only what',
        detail: 'the value was 4.0 because the winding was 3.0 ohm in the test, not 2.4',
      },
    ]),
};

const loopAccumulate: WorkflowTemplate = {
  id: 'loop-accumulate',
  mode: 'code',
  name: 'Loop over a list and keep a running total',
  blurb: 'The starting value, the loop, both ends of the list, and the one printed line.',
  build: () =>
    flow('code', 'Loop over a list and keep a running total', [
      {
        kind: 'input',
        title: 'The list and the starting total',
        detail: 'readings = [12.0, 11.4, 12.3]; total = 0.0',
      },
      {
        kind: 'loop',
        title: 'Add each reading once',
        detail: 'for reading in readings: total = total + reading',
      },
      {
        kind: 'branch',
        title: 'Reject a bad reading',
        detail: 'if reading < 0, skip it — a negative reading is a failed read',
        branch: { when: 'a reading is negative', to: 's4' },
      },
      {
        kind: 'test',
        title: 'Both ends of the list',
        detail: 'assert total_of([1.0, 2.0]) == 3.0; assert total_of([]) == 0.0',
      },
      { kind: 'output', title: 'Print the total once', detail: 'print(f"total {total:.1f}")' },
    ]),
};

const blank: WorkflowTemplate = {
  id: 'blank',
  mode: 'analysis',
  name: 'Start blank',
  blurb: 'One Given card, so the first press is an edit rather than a creation.',
  build: () => flow('analysis', '', [{ kind: 'given', title: '', detail: '' }]),
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  motorStall,
  sensorScale,
  pidLimits,
  functionFromExamples,
  debugFailingRun,
  loopAccumulate,
  blank,
];

export function templateById(id: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function templatesForMode(mode: WorkflowMode): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((template) => template.mode === mode);
}

/** The one lesson-aware join: P.15 is the lesson that teaches this exact flow. */
export function templateForLesson(lessonId: string): WorkflowTemplate | null {
  return lessonId === 'P.15' ? motorStall : null;
}
