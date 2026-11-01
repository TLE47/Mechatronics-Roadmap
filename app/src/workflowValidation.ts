/**
 * What is missing or worth saying about a workflow (`app/src/workflowValidation.ts`).
 *
 * Validation is advice, never a gate: every rule returns sentences a beginner can act on, names the
 * card it is about, and nothing in the app blocks a run or a lesson because an item is open. The
 * rules are one registry so a new semantic check is one function in one list, not another branch in
 * a growing `if` chain — the shape a node or edge type is added in is also the shape a rule is added
 * in.
 *
 * The rules read the model and nothing else: `workflow.ts` owns what a card is, `workflowProcesses`
 * owns the concurrency advice, and this module owns what a *diagram* must be honest about — a start,
 * a finish, a guard on each exit of a decision, and a flow from one to the other.
 *
 * The older rules are deliberately about the shape of a worked problem rather than its content: a
 * check that names no comparison is a wish, a compute with a number and no unit is the mistake this
 * course exists to break, and a model written as prose hides the law it is supposed to teach.
 */

import {
  KIND_META,
  edgeLabelFor,
  edgeTypeOf,
  workflowOrder,
  type WorkflowDoc,
  type WorkflowEdge,
  type WorkflowIssue,
  type WorkflowNode,
  type WorkflowSummary,
} from './workflow.ts';
import { forkJoinIssues, isForkJoin } from './workflowProcesses.ts';

/** Everything a rule may read, built once per validation pass. */
export interface WorkflowRuleContext {
  doc: WorkflowDoc;
  /** The reading order every message's "Step N" refers to. */
  order: WorkflowNode[];
  number: Map<string, number>;
  outgoing: Map<string, WorkflowEdge[]>;
  incoming: Map<string, WorkflowEdge[]>;
}

type WorkflowRule = (context: WorkflowRuleContext) => WorkflowIssue[];

function contextOf(doc: WorkflowDoc): WorkflowRuleContext {
  const order = workflowOrder(doc);
  const outgoing = new Map<string, WorkflowEdge[]>();
  const incoming = new Map<string, WorkflowEdge[]>();
  for (const edge of doc.edges) {
    const out = outgoing.get(edge.from);
    if (out) out.push(edge);
    else outgoing.set(edge.from, [edge]);
    const into = incoming.get(edge.to);
    if (into) into.push(edge);
    else incoming.set(edge.to, [edge]);
  }
  return {
    doc,
    order,
    number: new Map(order.map((node, index) => [node.id, index + 1])),
    outgoing,
    incoming,
  };
}

/** A flow arrow is the one the run follows; a cable is not execution. */
function controlOnly(edges: readonly WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter((edge) => edgeTypeOf(edge) === 'flow');
}

/** Every card a start card can reach by any arrow. */
function reachableFromStart(doc: WorkflowDoc): Set<string> {
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const next = new Map<string, string[]>();
  for (const edge of doc.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    const list = next.get(edge.from);
    if (list) list.push(edge.to);
    else next.set(edge.from, [edge.to]);
  }
  const reached = new Set<string>();
  const queue = doc.nodes.filter((node) => KIND_META[node.kind].start).map((node) => node.id);
  while (queue.length) {
    const id = queue.shift() ?? '';
    if (reached.has(id)) continue;
    reached.add(id);
    queue.push(...(next.get(id) ?? []));
  }
  return reached;
}

const noStart: WorkflowRule = (context) => {
  if (context.doc.nodes.some((node) => KIND_META[node.kind].start)) return [];
  return [
    {
      code: 'no-start',
      stepId: null,
      severity: 'open',
      message: 'Start with a Given card (or Input in a code flow): the numbers the problem hands you.',
    },
  ];
};

const noTerminal: WorkflowRule = (context) => {
  if (context.doc.nodes.some((node) => KIND_META[node.kind].terminal)) return [];
  return [
    {
      code: 'no-answer',
      stepId: null,
      severity: 'open',
      message:
        context.doc.mode === 'code'
          ? 'No Output card yet: say what leaves the program.'
          : 'No Answer card yet: state the result, with its unit.',
    },
  ];
};

const everyCard: WorkflowRule = (context) => {
  const issues: WorkflowIssue[] = [];
  const connected = new Set<string>();
  for (const edge of context.doc.edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  for (const node of context.order) {
    const where = `Step ${context.number.get(node.id) ?? '?'}`;
    // A fork or join is a bar, not a form: it has no title field, so it cannot be empty.
    if (!node.title && !isForkJoin(node.kind)) {
      issues.push({
        code: 'empty-step',
        stepId: node.id,
        severity: 'open',
        message: `${where} needs a title — one idea per card.`,
      });
    }
    if (context.doc.nodes.length > 1 && !connected.has(node.id)) {
      issues.push({
        code: 'unconnected',
        stepId: node.id,
        severity: 'open',
        message: `${where} is not connected — drag from its dot to the card it feeds.`,
      });
    }
    if (KIND_META[node.kind].measured && /\d/.test(node.detail) && !node.unit) {
      issues.push({
        code: 'missing-unit',
        stepId: node.id,
        severity: 'open',
        message: `${where} has a number but no unit — A, V, rad/s, %.`,
      });
    }
    if (node.kind === 'model' && !/[=≈→]/.test(node.detail) && !/[+\-*/×÷]/.test(node.detail)) {
      issues.push({
        code: 'model-without-equation',
        stepId: node.id,
        severity: 'open',
        message: `${where} is the model: write the law or relation, e.g. I = V / R.`,
      });
    }
    if (
      (node.kind === 'check' || node.kind === 'test') &&
      !/[<>=≤≥±]/.test(node.detail) &&
      !/(tolerance|within|fits|pass|fail|assert|equals|clamp)/i.test(node.detail)
    ) {
      issues.push({
        code: 'check-without-comparison',
        stepId: node.id,
        severity: 'hint',
        message: `${where} is a check: say what it compares — <, >, ±, or a tolerance.`,
      });
    }
  }
  return issues;
};

const computeWithoutCheck: WorkflowRule = (context) => {
  const hasCompute = context.doc.nodes.some((node) => node.kind === 'compute');
  const hasCheck = context.doc.nodes.some((node) => node.kind === 'check');
  if (!hasCompute || hasCheck) return [];
  return [
    {
      code: 'no-check',
      stepId: null,
      severity: 'hint',
      message: 'There is a compute but no check — add one bound, sign or size that must hold.',
    },
  ];
};

/**
 * More than one way out has to say when each is taken — whether the card is a Branch or an action
 * the learner gave two arrows, because the run pauses on either.
 *
 * The text is read the way the canvas labels the arrow (`edgeLabelFor`): the arrow's own guard, then
 * the branch card's condition, then its label — so a document that only ever had a card condition is
 * not accused of having no guards. A fork is excluded: its exits run together, they do not decide.
 */
const decisionExits: WorkflowRule = (context) => {
  const issues: WorkflowIssue[] = [];
  for (const node of context.order) {
    if (node.kind === 'fork' || KIND_META[node.kind].terminal) continue;
    const exits = controlOnly(context.outgoing.get(node.id) ?? []);
    if (exits.length < 2) continue;
    const unguarded = exits.filter((edge) => !edgeLabelFor(node, edge)).length;
    if (unguarded === 0) continue;
    issues.push({
      code: 'branch-without-guard',
      stepId: node.id,
      severity: 'open',
      message: `Step ${context.number.get(node.id) ?? '?'} has ${exits.length} ways out, but ${
        unguarded === 1 ? 'one has' : `${unguarded} have`
      } no guard — say when it is taken, e.g. [speed > 0.5].`,
    });
  }
  return issues;
};

/**
 * Two exits that say the same thing.
 *
 * A guard only decides if it can be told apart from its alternatives: two arrows out of one question
 * both labelled [fault] leave the run — and the reader — with no way to pick. Case and spacing are
 * ignored, because `[Temp > 80]` and `[temp  >  80]` are one condition written twice.
 */
const ambiguousGuards: WorkflowRule = (context) => {
  const issues: WorkflowIssue[] = [];
  for (const node of context.order) {
    if (node.kind === 'fork' || KIND_META[node.kind].terminal) continue;
    // Only the wording written on the exit itself counts: a Branch card's own condition is the
    // fallback every exit shares, so reading it here would call the old one-condition decision
    // ambiguous for saying exactly what it means.
    const exits = controlOnly(context.outgoing.get(node.id) ?? [])
      .map((edge) => (edge.guard || edge.label || '').trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const repeated = exits.find((guard) => {
      const key = guard.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    if (!repeated) continue;
    issues.push({
      code: 'ambiguous-guard',
      stepId: node.id,
      severity: 'open',
      message: `Step ${context.number.get(node.id) ?? '?'} has two ways out that both say "${repeated}" — a run cannot tell them apart, so say when each one is taken.`,
    });
  }
  return issues;
};

/**
 * A merge closes nothing when only one path leads into it.
 *
 * The mirror of the fork rule: a merge is where paths meet again, so it needs two ways in before it
 * has anything to merge. Advice, like every other rule — a half-drawn diagram is not an error.
 */
const mergeNeedsPaths: WorkflowRule = (context) => {
  const issues: WorkflowIssue[] = [];
  for (const node of context.order) {
    if (node.kind !== 'merge') continue;
    if (controlOnly(context.incoming.get(node.id) ?? []).length >= 2) continue;
    issues.push({
      code: 'merge-without-branches',
      stepId: node.id,
      severity: 'hint',
      message: `Step ${context.number.get(node.id) ?? '?'} is a merge — bring at least two paths into it, or use an Action instead.`,
    });
  }
  return issues;
};

/**
 * A connected group the start cannot reach.
 *
 * A card with no arrows at all is already `unconnected`; this rule is for the branch that was drawn
 * on its own, wired to itself, and then left behind — a diagram that looks connected and is not.
 */
const detachedFlow: WorkflowRule = (context) => {
  if (!context.doc.nodes.some((node) => KIND_META[node.kind].start)) return [];
  const reached = reachableFromStart(context.doc);
  const wired = new Set<string>();
  for (const edge of context.doc.edges) {
    wired.add(edge.from);
    wired.add(edge.to);
  }
  const issues: WorkflowIssue[] = [];
  for (const node of context.order) {
    if (KIND_META[node.kind].start || reached.has(node.id)) continue;
    // A card with no arrows at all is `unconnected`, which already says what to do; this rule is
    // for an island that was wired up and then left behind.
    if (!wired.has(node.id)) continue;
    issues.push({
      code: 'detached-flow',
      stepId: node.id,
      severity: 'hint',
      message: `Step ${context.number.get(node.id) ?? '?'} is in a detached part of the flow — no arrow from the start reaches it.`,
    });
  }
  return issues;
};

/** A start and a finish that exist but never meet: the diagram is not a flow yet. */
const finalPath: WorkflowRule = (context) => {
  const terminals = context.doc.nodes.filter((node) => KIND_META[node.kind].terminal);
  if (!terminals.length || !context.doc.nodes.some((node) => KIND_META[node.kind].start)) return [];
  const reached = reachableFromStart(context.doc);
  if (terminals.some((node) => reached.has(node.id))) return [];
  const answer = context.doc.mode === 'code' ? 'Output' : 'Answer';
  return [
    {
      code: 'no-final-path',
      stepId: null,
      severity: 'open',
      message: `No path reaches your ${answer} card — follow the arrows from the start to the end.`,
    },
  ];
};

/**
 * Every rule, in the order the checklist shows them.
 *
 * Adding a semantic check is adding one entry here; nothing else in the app has to know it exists.
 */
export const WORKFLOW_RULES: WorkflowRule[] = [
  noStart,
  noTerminal,
  everyCard,
  computeWithoutCheck,
  decisionExits,
  ambiguousGuards,
  mergeNeedsPaths,
  detachedFlow,
  finalPath,
];

export function validateWorkflow(doc: WorkflowDoc): WorkflowIssue[] {
  const context = contextOf(doc);
  return [
    ...WORKFLOW_RULES.flatMap((rule) => rule(context)),
    // Concurrency advice lives with the two bars that need it (`workflowProcesses.ts`).
    ...forkJoinIssues(doc, context.number),
  ];
}

export function workflowSummary(doc: WorkflowDoc): WorkflowSummary {
  const issues = validateWorkflow(doc);
  return {
    steps: doc.nodes.length,
    open: issues.filter((issue) => issue.severity === 'open').length,
    hints: issues.filter((issue) => issue.severity === 'hint').length,
  };
}
