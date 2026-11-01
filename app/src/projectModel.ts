/**
 * The engineering object model (`app/src/projectModel.ts`).
 *
 * A MechaLab project is one set of objects with one set of ids: the motor on the schematic, the
 * driver in the bill of materials and (later) the card in a workflow are the same object, not three
 * records that happen to share a name. This module holds the shapes, the report-derived data and the
 * summary; the kinds themselves — their readers, labels, groups, rows and doors — are declared once
 * in `projectKinds.ts`, and this file walks that declaration instead of naming each kind again.
 *
 * The id rule is `<project>/<first refDes>`: lowercase, one refDes when a line covers a bank
 * (`Q1,Q2,…,Q6` -> `capstone1/q1`), and never a position on the canvas, so editing a description, a
 * rating or a placement never renames the object. Requirements and tests use `<project>/<ref>`, the
 * same identity rule with their own stable `REQ-*` and `TEST-*` references.
 *
 * The read is total and strict. It claims each entry's id, ownership and uniqueness before asking
 * the declared kind to parse that entry, in declaration order, so no reader can opt out of the
 * shared `seen` set. The read stamps that claimed id onto what the parser returns; a parser that
 * returns a different id is refused. A collection is read before the next kind can use it, and a
 * kind may add a rule that only makes sense once every collection exists (a requirement with no
 * test is refused there). The summary is recomputed from the components on every read.
 */

import type { ProjectObject } from './projectRef.ts';
import {
  PROJECT_KINDS,
  type ProjectItem,
  type ProjectKindSpec,
  type ProjectReadContext,
} from './projectKinds.ts';
import {
  amount,
  claim,
  flag,
  isRecord,
  refSlug,
  round2,
  stamp,
  text,
  whole,
  type ProjectIdentity,
} from './projectRead.ts';
import { componentKind, type ComponentKind, type RequirementKind } from './projectVocabulary.ts';
import {
  requirementPasses,
  testPasses,
  testsForRequirement,
} from './projectStatus.ts';

export const PROJECT_SCHEMA = 'mechalab.project/1';

/** The vocabularies and the derived-status rules live beside the declaration; keep their names. */
export { COMPONENT_KINDS, REQUIREMENT_KINDS, componentKind } from './projectVocabulary.ts';
export type { ComponentKind, RequirementKind } from './projectVocabulary.ts';
export { requirementPasses, testPasses, testsForRequirement } from './projectStatus.ts';

export interface ProjectComponent {
  /** Stable across every surface: `<project id>/<first refDes>`. */
  id: string;
  /** The schematic's own designation, printed as the report writes it (`Q1,Q2,Q3,Q4,Q5,Q6`). */
  refDes: string;
  /** Placements: six for a single line covering six FETs. */
  qty: number;
  kind: ComponentKind;
  category: string;
  mpn: string;
  description: string;
  /** The part's own limit, e.g. `80V VDS, 173A ID`. */
  rating: string;
  /** The report's derating verdict for that pairing. */
  derated: boolean;
  unitCostUsd: number;
}

export interface ProjectSummary {
  /** BOM lines, not placements. */
  lines: number;
  placements: number;
  costUsd: number;
}

export interface ProjectCheck {
  /** What the design measured or counted, e.g. 90.92. */
  value: number;
  /** The unit the value and limit share, e.g. `°C`, `%`, `pairs`. */
  unit: string;
  /** The design limit the value is held against. */
  limit: number;
  /** `max` means value must not exceed limit; `min` means it must not fall below. */
  direction: 'max' | 'min';
}

/** One thing the project must do, with the parts that make it true. */
export interface ProjectRequirement {
  /** Stable: `<project id>/<ref>`, lowercase, so a card or a link cites it without a position. */
  id: string;
  /** The engineering reference a learner reads: `REQ-THERM-01`. */
  ref: string;
  kind: RequirementKind;
  title: string;
  /** One beginner-readable sentence, with the measured number in it. */
  statement: string;
  /** The components that meet it, in BOM order. Every id must resolve at read time. */
  partIds: string[];
}

/**
 * One measurement that judges a requirement. The number, its unit and its limit live here and only
 * here: a view prints `check` from the test rather than a second copy on the requirement.
 */
export interface ProjectTest {
  /** Stable: `<project id>/<ref>`, lowercase, so a card or a link cites it without a position. */
  id: string;
  /** The engineering reference a learner reads: `TEST-THERM-01`. */
  ref: string;
  title: string;
  /** How the number was established, so it cannot look like a wish. */
  method: string;
  check: ProjectCheck;
  /** The requirement this test judges. Must resolve at read time. */
  requirementId: string;
}

/**
 * The app's typed view of the document. This is the consumer's contract, not the read's shape:
 * `readProject` fills whatever collections the declaration names, and a fourth kind is read and
 * queried without touching this file. A production kind that gains a typed screen adds its field
 * here once, beside the screen that reads it; the test-only fourth kind in `test:project` proves
 * the generic path without this edit.
 */
export interface EngineeringProject {
  components: ProjectComponent[];
  requirements: ProjectRequirement[];
  tests: ProjectTest[];
  schema: typeof PROJECT_SCHEMA;
  /** The lab's own id, e.g. `08-capstone1-foc-eda`. */
  id: string;
  /** The repository path the project was read from, so a stale copy is traceable. */
  source: string;
  /** Recomputed from the components on every read; a stored total that disagrees is refused. */
  summary: ProjectSummary;
}

/** A kind's objects, looked up by the collection its entry names. */
export function collectionOf<T extends { id: string }>(
  project: EngineeringProject,
  spec: ProjectKindSpec
): readonly T[] {
  return (project as unknown as Record<string, readonly T[]>)[spec.collection] ?? [];
}

/**
 * Every object the document holds, in one list a picker or a test can walk.
 *
 * The declaration's order is the list's order: parts, then requirements, then tests. A workflow
 * card does not store the kind: the id already names one object, and `resolveProjectObject` can say
 * which. A fourth object type starts with one more entry in `projectKinds.ts`; the read and this
 * list need no new field and no new prefix on the id.
 */
export function projectObjects(
  project: EngineeringProject,
  kinds: readonly ProjectKindSpec[] = PROJECT_KINDS
): ProjectObject[] {
  return kinds.flatMap((spec) =>
    collectionOf<ProjectItem>(project, spec).map((item) => ({
      id: item.id,
      kind: spec.kind,
      label: spec.objectLabel(item),
    }))
  );
}

/** The one lookup every dangling-reference message is built on: no object, no citation. */
export function resolveProjectObject(
  project: EngineeringProject,
  id: string | null | undefined,
  kinds: readonly ProjectKindSpec[] = PROJECT_KINDS
): ProjectObject | undefined {
  if (!id) return undefined;
  for (const spec of kinds) {
    const item = collectionOf<ProjectItem>(project, spec).find((entry) => entry.id === id);
    if (item) return { id: item.id, kind: spec.kind, label: spec.objectLabel(item) };
  }
  return undefined;
}

/** The read's own assembly handle; a reader only ever receives the `read` half. */
interface ProjectBuildContext extends ProjectReadContext {
  add(collection: string, items: unknown[]): void;
  entries(): [string, unknown[]][];
}

/**
 * Read a project document, refusing every shape that would render a number the components do not
 * support. Pure and total: the input is `unknown`, and the caller gets either a project whose
 * summary is the components' own sum or an error naming the field.
 */
export function readProject<
  C extends Record<string, unknown[]> = Record<string, never>,
>(
  raw: unknown,
  kinds: readonly ProjectKindSpec[] = PROJECT_KINDS
): EngineeringProject & C {
  if (!isRecord(raw)) throw new Error('project: expected an object');
  if (raw.schema !== PROJECT_SCHEMA) {
    throw new Error(`project: schema is ${String(raw.schema)}, expected ${PROJECT_SCHEMA}`);
  }
  const id = text(raw.id, 'id');
  const source = text(raw.source, 'source');
  const collections = new Map<string, unknown[]>();
  const identity: ProjectIdentity = { projectId: id, seen: new Set<string>() };
  const context: ProjectBuildContext = {
    read: <T>(collection: string) => (collections.get(collection) ?? []) as T[],
    add: (collection: string, items: unknown[]) => {
      collections.set(collection, items);
    },
    entries: () => [...collections.entries()],
  };

  // The declaration's order is the read's order. `claim` runs before the kind's reader, so
  // ownership and a duplicate id are the read's rule rather than a reader's courtesy; `stamp`
  // writes the claimed id onto the parsed fields and refuses a reader that substitutes another. A
  // collection is complete before the next kind's reader sees it, which is what lets a requirement
  // cite a part and a test name a requirement without a second table of what each kind may refer to.
  for (const spec of kinds) {
    const entries = raw[spec.collection];
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error(`project: no ${spec.collection}`);
    }
    context.add(
      spec.collection,
      entries.map((entry, index) => {
        const where = `${spec.collection}[${index}]`;
        const claimed = claim(entry, where, spec.noun, identity);
        return stamp(claimed, spec.read(claimed, index, context), spec.noun);
      })
    );
  }

  const components = context.read<ProjectComponent>('components');
  const computed: ProjectSummary = {
    lines: components.length,
    placements: components.reduce((total, component) => total + component.qty, 0),
    costUsd: round2(
      components.reduce(
        (total, component) => total + component.qty * component.unitCostUsd,
        0
      )
    ),
  };
  if (!isRecord(raw.summary)) throw new Error('project: no summary');
  const stored = {
    lines: whole(raw.summary.lines, 'summary.lines'),
    placements: whole(raw.summary.placements, 'summary.placements'),
    costUsd: amount(raw.summary.costUsd, 'summary.costUsd'),
  };
  if (
    stored.lines !== computed.lines ||
    stored.placements !== computed.placements ||
    stored.costUsd !== computed.costUsd
  ) {
    throw new Error(
      `project: summary says ${stored.lines} lines / ${stored.placements} placements / ` +
        `$${stored.costUsd.toFixed(2)}, the components add up to ${computed.lines} / ` +
        `${computed.placements} / $${computed.costUsd.toFixed(2)}`
    );
  }

  const project = {
    schema: PROJECT_SCHEMA,
    id,
    source,
    summary: computed,
    ...Object.fromEntries(context.entries()),
  } as unknown as EngineeringProject & C;
  for (const spec of kinds) spec.verify?.(project);
  return project;
}

function metric(record: Record<string, unknown>, field: string, where: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`project: ${where}.${field} is not a measured number`);
  }
  return value;
}

/** A number as a sentence writes it: whole when it is whole, two decimals otherwise. */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * The project's requirements and the tests that judge them, derived from the report's numbers.
 *
 * Each requirement names the parts that meet it by their generated ids, so the link is checked by
 * the same reader that checks the parts. The values are the report's (a design that changes the FET
 * changes the temperature in the sentence and the measurement); the limits and floors are the
 * capstone's own pass criteria (`thermal_and_voltage_ok`, `pulse_thermal_ok`, the derating verdict
 * and the $50 prototype budget), stated once here rather than retyped in a view.
 *
 * A seed carries the measurement once. The requirement is its statement and parts; the test is its
 * method, its measured value, its limit and the requirement it judges. Neither holds a second copy.
 */
type VerificationSeed = Omit<ProjectRequirement, 'id'> & {
  testTitle: string;
  method: string;
  check: ProjectCheck;
};

function verificationFromReport(
  raw: Record<string, unknown>,
  projectId: string,
  components: ProjectComponent[]
): { requirements: ProjectRequirement[]; tests: ProjectTest[] } {
  if (!isRecord(raw.thermal_and_switching)) {
    throw new Error('project: the report has no thermal_and_switching');
  }
  if (!isRecord(raw.erc_verification)) throw new Error('project: the report has no erc_verification');
  const thermal = raw.thermal_and_switching;
  const erc = raw.erc_verification;
  const bus = metric(thermal, 'v_bus_v', 'thermal_and_switching');
  const iRms = metric(thermal, 'i_rms_cont_a', 'thermal_and_switching');
  const iPulse = metric(thermal, 'i_peak_a', 'thermal_and_switching');
  const pulseS = metric(thermal, 'pulse_duration_s', 'thermal_and_switching');
  const tj = metric(thermal, 'steady_state_tj_c', 'thermal_and_switching');
  const tjLimit = metric(thermal, 'tj_limit_c', 'thermal_and_switching');
  const pulseTj = metric(thermal, 'pulse_tj_c', 'thermal_and_switching');
  const loss = metric(thermal, 'p_total_loss_w', 'thermal_and_switching');
  const efficiency = metric(thermal, 'inverter_efficiency_pct', 'thermal_and_switching');
  const vPeak = metric(thermal, 'v_ds_peak_turnoff_v', 'thermal_and_switching');
  const vLimit = metric(thermal, 'v_ds_limit_v', 'thermal_and_switching');
  const kelvinPairs = metric(erc, 'kelvin_sense_pairs', 'erc_verification');
  const pwmChannels = metric(erc, 'complimentary_pwm_channels', 'erc_verification');
  const sto = flag(erc.dual_channel_sto_verified, 'erc_verification.dual_channel_sto_verified');
  const cost = metric(raw, 'total_bom_cost_usd', 'report');
  const derated = components.filter((component) => component.derated).length;
  const canTransceivers = components.filter((component) => component.category === 'CAN-FD Transceiver').length;

  const part = (slug: string, ref: string): string => {
    const id = `${projectId}/${slug}`;
    if (!components.some((component) => component.id === id)) {
      throw new Error(`project: ${ref} cites ${id}, which no BOM line has`);
    }
    return id;
  };

  const seeds: VerificationSeed[] = [
    {
      ref: 'REQ-THERM-01',
      kind: 'thermal',
      title: 'Stay cool at full load',
      testTitle: 'Junction temperature at full load',
      statement: `At ${fmt(bus)} V and ${fmt(iRms)} A_rms the MOSFET junction settles at ${fmt(tj)} °C, under the ${fmt(tjLimit)} °C limit.`,
      method: 'Steady-state electro-thermal solve in the EDA report',
      check: { value: tj, unit: '°C', limit: tjLimit, direction: 'max' },
      partIds: [part('q1', 'REQ-THERM-01'), part('u2', 'REQ-THERM-01'), part('c-hf1-c-hf6', 'REQ-THERM-01'), part('c-bulk1', 'REQ-THERM-01')],
    },
    {
      ref: 'REQ-THERM-02',
      kind: 'thermal',
      title: 'Survive a current burst',
      testTitle: 'Junction temperature in a burst',
      statement: `A ${fmt(iPulse)} A burst lasting ${fmt(pulseS)} s raises the junction to ${fmt(pulseTj)} °C, still under the ${fmt(tjLimit)} °C limit.`,
      method: 'Transient Cauer-ladder pulse solve in the EDA report',
      check: { value: pulseTj, unit: '°C', limit: tjLimit, direction: 'max' },
      partIds: [part('q1', 'REQ-THERM-02'), part('u2', 'REQ-THERM-02')],
    },
    {
      ref: 'REQ-ELEC-01',
      kind: 'electrical',
      title: 'Convert power efficiently',
      testTitle: 'Inverter efficiency at full load',
      statement: `Drive losses total ${fmt(loss)} W, so the inverter keeps ${fmt(efficiency)} % efficiency at full load against a 97 % floor.`,
      method: 'Conduction, switching, dead-time and shunt loss model',
      check: { value: efficiency, unit: '%', limit: 97, direction: 'min' },
      partIds: [part('q1', 'REQ-ELEC-01'), part('u2', 'REQ-ELEC-01'), part('r-sh-a', 'REQ-ELEC-01')],
    },
    {
      ref: 'REQ-ELEC-02',
      kind: 'electrical',
      title: 'Hold the switch-node spike',
      testTitle: 'Switch-node spike at turn-off',
      statement: `A ${fmt(iPulse)} A turn-off spikes the switch node to ${fmt(vPeak)} V, below the ${fmt(vLimit)} V ceiling.`,
      method: 'Loop-inductance turn-off model in the EDA report',
      check: { value: vPeak, unit: 'V', limit: vLimit, direction: 'max' },
      partIds: [part('q1', 'REQ-ELEC-02'), part('c-hf1-c-hf6', 'REQ-ELEC-02'), part('c-bulk1', 'REQ-ELEC-02')],
    },
    {
      ref: 'REQ-CTRL-01',
      kind: 'control',
      title: 'Drive all three phases',
      testTitle: 'Complementary PWM channels',
      statement: `${fmt(pwmChannels)} complementary PWM channels reach the six-FET bridge, one pair per phase.`,
      method: 'ERC net count on the gate-drive nets',
      check: { value: pwmChannels, unit: 'channels', limit: 6, direction: 'min' },
      partIds: [part('u1', 'REQ-CTRL-01'), part('u2', 'REQ-CTRL-01'), part('q1', 'REQ-CTRL-01')],
    },
    {
      ref: 'REQ-SENSE-01',
      kind: 'sensing',
      title: 'Measure every phase current',
      testTitle: 'Kelvin sense pairs',
      statement: `${fmt(kelvinPairs)} Kelvin shunt pairs feed the current loop, one per phase, so the control loop sees real current.`,
      method: 'ERC Kelvin-sense pair count',
      check: { value: kelvinPairs, unit: 'pairs', limit: 3, direction: 'min' },
      partIds: [part('u3', 'REQ-SENSE-01'), part('r-sh-a', 'REQ-SENSE-01')],
    },
    {
      ref: 'REQ-COMMS-01',
      kind: 'interface',
      title: 'Report to the controller',
      testTitle: 'Fitted CAN-FD transceiver',
      statement: `A CAN-FD transceiver carries telemetry and commands off the board (${fmt(canTransceivers)} fitted).`,
      method: 'BOM review against the interface section',
      check: { value: canTransceivers, unit: 'transceiver', limit: 1, direction: 'min' },
      partIds: [part('u7', 'REQ-COMMS-01'), part('u1', 'REQ-COMMS-01')],
    },
    {
      ref: 'REQ-SAFE-01',
      kind: 'safety',
      title: 'Cut the bridge in a fault',
      testTitle: 'Safe Torque Off channels',
      statement: `${sto ? 'Two independent' : 'Only one'} Safe Torque Off channel${sto ? 's' : ''} can disable the gate driver, so a fault removes drive even if the MCU hangs.`,
      method: 'ERC dual-channel STO verification',
      check: { value: sto ? 2 : 1, unit: 'channels', limit: 2, direction: 'min' },
      partIds: [part('u10', 'REQ-SAFE-01'), part('u2', 'REQ-SAFE-01'), part('q1', 'REQ-SAFE-01')],
    },
    {
      ref: 'REQ-RELI-01',
      kind: 'reliability',
      title: 'Keep every part inside its rating',
      testTitle: 'Derated BOM lines',
      statement: `${derated} of ${components.length} BOM lines pass their derating check against the stress they see.`,
      method: 'Per-line derating review in the EDA report',
      check: { value: derated, unit: 'lines', limit: components.length, direction: 'min' },
      partIds: components.map((component) => component.id),
    },
    {
      ref: 'REQ-COST-01',
      kind: 'budget',
      title: 'Stay inside the prototype budget',
      testTitle: 'Prototype BOM cost',
      statement: `The bill of materials totals $${fmt(cost)} for one board, inside the $50 prototype budget.`,
      method: 'BOM costing in the EDA report',
      check: { value: cost, unit: 'USD', limit: 50, direction: 'max' },
      partIds: [part('u1', 'REQ-COST-01'), part('q1', 'REQ-COST-01'), part('u2', 'REQ-COST-01'), part('u6', 'REQ-COST-01'), part('u8', 'REQ-COST-01')],
    },
  ];
  const requirements = seeds.map(({ testTitle, method, check, ...seed }) => ({
    ...seed,
    id: `${projectId}/${seed.ref.toLowerCase()}`,
  }));
  const tests = seeds.map((seed) => {
    const ref = seed.ref.replace('REQ-', 'TEST-');
    return {
      id: `${projectId}/${ref.toLowerCase()}`,
      ref,
      title: seed.testTitle,
      method: seed.method,
      check: seed.check,
      requirementId: `${projectId}/${seed.ref.toLowerCase()}`,
    };
  });
  return { requirements, tests };
}

/**
 * Build a project from a lab's EDA report (`foc_thermal_and_bom.json`) and read it back.
 *
 * The report is the source of truth: it is generated and verified by the capstone's own script, and
 * its totals are checked against the rows here, so the app cannot show a BOM whose cost or count
 * drifted from the design. `source` is the report's repository path, kept for a stale-copy trace.
 */
export function projectFromReport(raw: unknown, source: string): EngineeringProject {
  if (!isRecord(raw)) throw new Error('project: the report is not an object');
  const id = text(raw.lab, 'report lab');
  if (!Array.isArray(raw.bom) || raw.bom.length === 0) {
    throw new Error(`project: ${id} has no BOM`);
  }
  const components: ProjectComponent[] = raw.bom.map((entry, index) => {
    const where = `bom[${index}]`;
    if (!isRecord(entry)) throw new Error(`project: ${where} is not an object`);
    const refDes = text(entry.ref_des, `${where}.ref_des`);
    const category = text(entry.category, `${where}.category`);
    return {
      id: `${id}/${refSlug(refDes, `${where}.ref_des`)}`,
      refDes,
      qty: whole(entry.qty, `${where}.qty`),
      kind: componentKind(category),
      category,
      mpn: text(entry.mpn, `${where}.mpn`),
      description: text(entry.description, `${where}.description`),
      rating: text(entry.rating_spec, `${where}.rating_spec`),
      derated: flag(entry.derating_ok, `${where}.derating_ok`),
      unitCostUsd: amount(entry.unit_cost_usd, `${where}.unit_cost_usd`),
    };
  });
  const { requirements, tests } = verificationFromReport(raw, id, components);
  return readProject({
    schema: PROJECT_SCHEMA,
    id,
    source,
    summary: {
      lines: raw.total_unique_bom_lines,
      placements: raw.total_component_Placements,
      costUsd: raw.total_bom_cost_usd,
    },
    components,
    requirements,
    tests,
  });
}
