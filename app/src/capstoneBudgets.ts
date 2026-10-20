/**
 * The Tier 3 capstone's budget bench: the four numbers a build must clear before first motion.
 *
 * `08-capstones.T3.07a` is a design-budget lesson, so its harness is not a fault repair but an
 * unseen design point: an error budget, the latency chain that spends it on phase margin, the delay
 * the remaining margin may buy, and the five-domain sign-off. Every number comes from the learner's
 * own functions, measured on inputs the module never shows them, and compared with the same limits
 * the sign-off uses (0.50 mm, 45 deg).
 */

import type { LessonHarness, HarnessUnit } from './harnessGrading.ts';

/** The unseen design point the bench measures. None of these inputs appear in the module. */
const BENCH = {
  biases: [0.02, -0.03, 0.05],
  sigmas: [0.04, 0.07, 0.02, 0.09],
  /** Sensor, bus, filter and compute delays, plus the 1 kHz sample period, all in microseconds. */
  sensUs: 30.0,
  busUs: 210.0,
  filtUs: 350.0,
  compUs: 90.0,
  tickUs: 1000.0,
  crossover: 180.0,
  marginNominalDeg: 60.0,
  /** The 15 degrees of margin left after reserving the 45 degree floor from a 60 degree nominal. */
  spareDeg: 15.0,
  /** The chain this budget must cover: 1180 us including the zero-order hold. */
  chainMs: 1.18,
} as const;

export const T3_TARGETS = {
  budgetMm: 0.5,
  marginDeg: 45.0,
  chainMs: BENCH.chainMs,
  signoffAgreements: 2,
} as const;

export const T3_HARNESS_UNITS: HarnessUnit[] = [
  {
    key: 'budget',
    label: '3σ spatial budget',
    unit: 'mm',
    target: T3_TARGETS.budgetMm,
    direction: 'atMost',
  },
  {
    key: 'margin',
    label: 'net phase margin',
    unit: 'deg',
    target: T3_TARGETS.marginDeg,
    direction: 'atLeast',
    digits: 1,
  },
  {
    key: 'allowance',
    label: 'delay the spare margin buys',
    unit: 'ms',
    target: T3_TARGETS.chainMs,
    direction: 'atLeast',
  },
  {
    key: 'signoff',
    label: 'sign-off verdicts correct',
    unit: 'of 2',
    target: T3_TARGETS.signoffAgreements,
    direction: 'atLeast',
    digits: null,
  },
];

/**
 * Runs inside the Pyodide worker after the learner's program. It prints nothing: the JSON comes
 * back through a global, like the 08.1 bench.
 */
export const T3_HARNESS_PY = `
import builtins, json, math


def __mechalab_bench_metrics():
    ns = {
        name: value
        for name, value in __mechalab_ns__.items()
        if not name.startswith("_") and name not in builtins.__dict__
    }

    biases = (${BENCH.biases.join(', ')})
    sigmas = (${BENCH.sigmas.join(', ')})
    sens_us, bus_us, filt_us, comp_us, tick_us = (
        ${BENCH.sensUs}, ${BENCH.busUs}, ${BENCH.filtUs}, ${BENCH.compUs}, ${BENCH.tickUs}
    )
    pm0_deg, w_gc = ${BENCH.marginNominalDeg}, ${BENCH.crossover}
    spare_rad = math.radians(${BENCH.spareDeg})

    def _number(name, *args):
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

    def _budget():
        return _number("error_budget_3sigma", biases, sigmas)

    def _margin():
        chain = _number("total_latency_s", sens_us, bus_us, filt_us, comp_us, tick_us)
        return _number("net_phase_margin_deg", pm0_deg, w_gc, chain)

    def _allowance():
        return _number("max_allowable_delay_ms", spare_rad, w_gc)

    def _signoff():
        # Both verdicts are graded on this bench's own budget and margin, so the sign-off function
        # is judged on its five-domain conjunction rather than on any number it is handed.
        gate = ns.get("capstone_signoff")
        if not callable(gate):
            raise NameError("capstone_signoff is not defined in your program")
        agreed = 0.0
        for sto, expected in ((True, True), (False, False)):
            if gate(${T3_TARGETS.budgetMm - 0.0326}, 49.0, 0.42, 60.0, sto) is expected:
                agreed += 1.0
        return agreed

    return {
        "budget": _metric(_budget),
        "margin": _metric(_margin),
        "allowance": _metric(_allowance),
        "signoff": _metric(_signoff),
    }


__mechalab_bench_json__ = json.dumps(__mechalab_bench_metrics())
`;

export const T3_HARNESS: LessonHarness = {
  lessonId: 'EX.08-capstones.T3.07a',
  title: 'Tier 3 capstone budget bench · grades your functions',
  action: 'Grade my budgets',
  units: T3_HARNESS_UNITS,
  source: T3_HARNESS_PY,
};
