/**
 * Grading a capstone by the numbers its own functions produce.
 *
 * The 08.1 four-fault bench started this: a lesson's pass condition is not the text its program
 * prints but the metrics a harness measures from the learner's own functions, computed with the
 * harness's own arithmetic. This module is the part that is not about any one lesson — the report
 * shape, the per-unit targets and directions, and the verdict the runner gates the pass on.
 *
 * A harness is a Python snippet the runner executes after the learner's program. It sets
 * `__mechalab_bench_json__` to a JSON object of `{unit: {value, error}}`; the unit keys, labels,
 * units and targets live here, in TypeScript, so the page can render a card even when the call that
 * was supposed to produce the number raised.
 */

/** One measured number, or the error that stopped the call. `value: null` means the call raised. */
export interface HarnessMetric {
  value: number | null;
  /** Why the call failed, when it did (`NameError`, a wrong return type, ...). */
  error: string;
}

export type HarnessReport = Record<string, HarnessMetric>;

/** A budget is met by staying under its target; a margin is met by staying above it. */
export type HarnessDirection = 'atMost' | 'atLeast';

export interface HarnessUnit {
  /** The key the Python harness reports this number under. */
  key: string;
  /** What the card calls it, in the learner's words. */
  label: string;
  /** The unit suffix (`mm`, `deg`, `ms`, `/2`); empty for a bare count. */
  unit: string;
  target: number;
  direction: HarnessDirection;
  /** Decimal places the card prints; `null` prints the number as a count. */
  digits?: number | null;
}

export interface LessonHarness {
  lessonId: string;
  /** The heading a panel shows above its cards. */
  title: string;
  /** What the panel's grade button says. */
  action: string;
  units: HarnessUnit[];
  /** The Python that produces `__mechalab_bench_json__`; run after the learner's program. */
  source: string;
}

export interface HarnessGate {
  /** True only when every unit is on the right side of its target: the lesson's pass condition. */
  passed: boolean;
  met: number;
  total: number;
  /** One line per unit that missed its target, naming the number it left behind. */
  failures: string[];
  /** The same verdict as one sentence, for the guide and the learning log. */
  summary: string;
}

const COMPARATORS: Record<HarnessDirection, (value: number, target: number) => boolean> = {
  atMost: (value, target) => value <= target,
  atLeast: (value, target) => value >= target,
};

/** `1.20 mm`, `47.8 deg`, `2 / 2` — the number in the unit the card uses. */
export function formatHarnessMetric(
  value: number | null,
  unit: HarnessUnit
): string {
  if (value === null) return '—';
  const digits = unit.digits === null ? 0 : unit.digits ?? 2;
  const text = value.toFixed(digits);
  // A percent reads as `37.2%`, not `37.2 %`; every other unit keeps its space.
  if (unit.unit === '%') return `${text}%`;
  return unit.unit ? `${text} ${unit.unit}` : text;
}

/** The target phrase a failure line carries: `target ≤ 0.50 mm` or `target ≥ 45.0 deg`. */
export function formatHarnessTarget(unit: HarnessUnit): string {
  const symbol = unit.direction === 'atMost' ? '≤' : '≥';
  return `target ${symbol} ${formatHarnessMetric(unit.target, unit)}`;
}

function readMetric(raw: unknown): HarnessMetric | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { value?: unknown; error?: unknown };
  const value =
    typeof candidate.value === 'number' && Number.isFinite(candidate.value)
      ? candidate.value
      : null;
  const error = typeof candidate.error === 'string' ? candidate.error : '';
  if (value === null && !error) return null;
  return { value, error };
}

/**
 * Turns the worker's JSON string into a report for this harness, or `null` when it is not one.
 * Every unit the harness declares must be present: a partial report cannot pass a lesson.
 */
export function parseHarnessReport(raw: unknown, harness: LessonHarness): HarnessReport | null {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const source = parsed as Record<string, unknown>;
  const report: HarnessReport = {};
  for (const unit of harness.units) {
    const metric = readMetric(source[unit.key]);
    if (!metric) return null;
    report[unit.key] = metric;
  }
  return report;
}

export type HarnessVerdict = 'unrun' | 'met' | 'missed' | 'error';

/** How one card reads: never graded, at target, off its target, or a call that raised. */
export function unitVerdict(
  unit: HarnessUnit,
  metric: HarnessMetric | undefined
): HarnessVerdict {
  if (!metric) return 'unrun';
  if (metric.value === null) return 'error';
  return COMPARATORS[unit.direction](metric.value, unit.target) ? 'met' : 'missed';
}

/**
 * The pass condition. A lesson verifies only when every unit is on the right side of its target; a
 * report that never arrived is unproven, not a pass, and a call that raised fails by name.
 */
export function harnessGate(harness: LessonHarness, report: HarnessReport | null): HarnessGate {
  const total = harness.units.length;
  if (!report) {
    return {
      passed: false,
      met: 0,
      total,
      failures: ['the harness did not report: no graded metrics came back from this run'],
      summary: `0 / ${total} graded metrics at target — the harness did not report.`,
    };
  }
  const failures: string[] = [];
  for (const unit of harness.units) {
    const metric = report[unit.key];
    switch (unitVerdict(unit, metric)) {
      case 'met':
        continue;
      case 'unrun':
        failures.push(`${unit.label}: not reported by the harness`);
        break;
      case 'error':
        failures.push(`${unit.label}: call failed — ${metric?.error ?? ''}`);
        break;
      default:
        failures.push(
          `${unit.label}: ${formatHarnessMetric(metric?.value ?? null, unit)} (${formatHarnessTarget(
            unit
          )})`
        );
    }
  }
  const met = total - failures.length;
  return {
    passed: failures.length === 0,
    met,
    total,
    failures,
    summary:
      failures.length === 0
        ? `${total} / ${total} graded metrics at target.`
        : `${met} / ${total} graded metrics at target — ${failures.join('; ')}.`,
  };
}
