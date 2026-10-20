/**
 * Grading the 08.1 bench against the learner's own repair functions.
 *
 * The bench used to flip a boolean per fault. Now the Python runner executes
 * `FAULT_BENCH_PY` after the learner's program and hands back the tip error (or overshoot)
 * that each of their `repair_*` functions actually produces, so a return value that is close
 * but wrong keeps its real metric instead of turning green on a toggle.
 *
 * The harness computes its own forward kinematics: a learner with a broken `fk_2link` cannot
 * grade their own encoder repair with it.
 */

export type RepairUnit = 'mm' | '%';

export interface RepairMetric {
  /** The tip error in mm, or the overshoot in percent. `null` when the call raised. */
  value: number | null;
  /** Why the call failed, when it did (`NameError`, a wrong return type, ...). */
  error: string;
}

export interface FaultBenchReport {
  offset: RepairMetric;
  cpr: RepairMetric;
  antiWindup: RepairMetric;
  gravity: RepairMetric;
}

/** The targets the page's proof block asserts: under 1 mm, and under 5% overshoot. */
export const TIP_TARGET_MM = 1;
export const OVERSHOOT_TARGET_PCT = 5;

export const FAULT_BENCH_TARGETS: Record<keyof FaultBenchReport, number> = {
  offset: TIP_TARGET_MM,
  cpr: TIP_TARGET_MM,
  antiWindup: OVERSHOOT_TARGET_PCT,
  gravity: TIP_TARGET_MM,
};

export type RepairVerdict = 'unrun' | 'repaired' | 'broken' | 'error';

/**
 * Runs inside the Pyodide worker, after the learner's program and before the instructor
 * tests' failure is reported. It prints nothing: the JSON comes back through a global.
 */
export const FAULT_BENCH_PY = `
import builtins, json, math


def __mechalab_bench_metrics():
    ns = {
        name: value
        for name, value in __mechalab_ns__.items()
        if not name.startswith("_") and name not in builtins.__dict__
    }

    def _fk(q1):
        return 0.20 * math.cos(q1), 0.20 * math.sin(q1)

    def _tip_err(q_true, q_measured):
        x_true, y_true = _fk(q_true)
        x_meas, y_meas = _fk(q_measured)
        return math.hypot(x_meas - x_true, y_meas - y_true) * 1000.0

    def _call(name, *args):
        fn = ns.get(name)
        if not callable(fn):
            raise NameError(name + " is not defined in your program")
        value = fn(*args)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError(name + " must return a number, got " + type(value).__name__)
        return float(value)

    def _metric(fn):
        try:
            return {"value": fn(), "error": ""}
        except Exception as ex:
            return {"value": None, "error": type(ex).__name__ + ": " + str(ex)}

    q_true = 0.30
    offset_rad = 0.06
    tau_g = (0.20 * 0.05 + 0.15 * 0.10) * 9.81 + 0.15 * 9.81 * 0.05

    def _offset():
        return _tip_err(q_true, _call("repair_encoder_offset", q_true + offset_rad, offset_rad))

    def _cpr():
        return _tip_err(q_true, _call("repair_encoder_cpr", q_true * 4.0, 4.0))

    def _gravity():
        command = _call("repair_gravity_sign", -tau_g)
        return _tip_err(0.0, (command - tau_g) / 4.0)

    def _anti_windup():
        J, b, tau, u_max, dt = 0.02, 0.05, 0.60, 1.20, 0.001
        kp, ki, kd = 4.0, 12.0, 0.4
        q = dq = i_term = peak = 0.0
        for _ in range(3000):
            e = 1.0 - q
            i_candidate = i_term + ki * e * dt
            u_raw = kp * e - kd * dq + i_candidate
            i_term = _call("repair_integral_update", i_term, i_candidate, e, u_raw, u_max)
            u = max(-u_max, min(u_max, kp * e - kd * dq + i_term))
            ddq = (u - b * dq - tau) / J
            dq += ddq * dt
            q += dq * dt
            peak = max(peak, q)
        return max(0.0, peak - 1.0) * 100.0

    return {
        "offset": _metric(_offset),
        "cpr": _metric(_cpr),
        "antiWindup": _metric(_anti_windup),
        "gravity": _metric(_gravity),
    }


__mechalab_bench_json__ = json.dumps(__mechalab_bench_metrics())
`;

const METRIC_KEYS: (keyof FaultBenchReport)[] = ['offset', 'cpr', 'antiWindup', 'gravity'];

function readMetric(raw: unknown): RepairMetric | null {
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

/** Turns the worker's JSON string into a report, or `null` when it is not one. */
export function parseBenchReport(raw: unknown): FaultBenchReport | null {
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
  const report = {} as FaultBenchReport;
  for (const key of METRIC_KEYS) {
    const metric = readMetric(source[key]);
    if (!metric) return null;
    report[key] = metric;
  }
  return report;
}

/** How one card should read: never run, fixed, still broken at its real metric, or a failed call. */
export function repairVerdict(
  metric: RepairMetric | undefined,
  target: number
): RepairVerdict {
  if (!metric) return 'unrun';
  if (metric.value === null) return 'error';
  return metric.value <= target ? 'repaired' : 'broken';
}

/** One number in the unit the card uses; `null` means the learner's call raised. */
export function formatRepairMetric(value: number | null, unit: RepairUnit): string {
  if (value === null) return '—';
  return unit === '%' ? `${value.toFixed(1)}%` : `${value.toFixed(2)} mm`;
}

/** Counts the units a run has fixed, which is the header's `n / 4 repaired`. */
export function countRepaired(report: FaultBenchReport | null): number {
  if (!report) return 0;
  return METRIC_KEYS.reduce(
    (total, key) =>
      total + (repairVerdict(report[key], FAULT_BENCH_TARGETS[key]) === 'repaired' ? 1 : 0),
    0
  );
}
