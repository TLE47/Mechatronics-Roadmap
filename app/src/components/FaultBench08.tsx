import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, Play, RotateCcw, Wrench } from 'lucide-react';
import {
  ZERO_OFFSET_RAD,
  antiWindupOvershootPct,
  cprTipErrorMm,
  gravityTipErrorMm,
  zeroOffsetCurve,
  zeroOffsetTipErrorMm,
} from '../faultBench';
import {
  FAULT_BENCH_TARGETS,
  FaultBenchReport,
  TIP_TARGET_MM,
  countRepaired,
  formatRepairMetric,
  repairVerdict,
} from '../faultBenchGrading';

interface FaultBench08Props {
  /** The metrics the learner's own repair functions returned on the last run. */
  report: FaultBenchReport | null;
  /** True while the runner is executing the editor's code. */
  grading: boolean;
  /** Runs the editor's code, which is what refreshes the report. */
  onGrade: () => void;
}

type ToggleFaultId = 'cpr' | 'antiWindup' | 'gravity';
type MetricUnit = 'mm' | '%';

interface BenchCardSpec {
  id: ToggleFaultId;
  badge: string;
  title: string;
  /** The metric the broken unit produces, before any repair. */
  broken: number;
  unit: MetricUnit;
  testId: string;
}

const ZERO_CURVE = zeroOffsetCurve(24);
const ANTI_WINDUP_BEFORE = antiWindupOvershootPct(false);

const BENCH_CARDS: BenchCardSpec[] = [
  {
    id: 'cpr',
    badge: 'Broken B · CPR scale',
    title: 'Encoder reports 4× the true angle',
    broken: cprTipErrorMm(1),
    unit: 'mm',
    testId: 'cpr',
  },
  {
    id: 'antiWindup',
    badge: 'Broken C · anti-windup',
    title: 'Integral keeps charging while clipped',
    broken: ANTI_WINDUP_BEFORE,
    unit: '%',
    testId: 'anti-windup',
  },
  {
    id: 'gravity',
    badge: 'Broken A · gravity sign',
    title: 'Feedforward command is inverted',
    broken: gravityTipErrorMm(false),
    unit: 'mm',
    testId: 'gravity',
  },
];

const CHART_WIDTH = 320;
const CHART_HEIGHT = 108;
const CHART_LEFT = 34;
const CHART_RIGHT = 308;
const CHART_TOP = 10;
const CHART_BOTTOM = 78;
const ZERO_CURVE_MAX_MM = 12;

function chartX(correctionRad: number): number {
  return CHART_LEFT + (correctionRad / ZERO_OFFSET_RAD) * (CHART_RIGHT - CHART_LEFT);
}

function chartY(errorMm: number): number {
  return CHART_BOTTOM - (errorMm / ZERO_CURVE_MAX_MM) * (CHART_BOTTOM - CHART_TOP);
}

function statusBadge(verdict: ReturnType<typeof repairVerdict>): React.ReactNode {
  if (verdict === 'repaired') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#34d399]">
        <CheckCircle2 className="w-3 h-3" /> REPAIRED
      </span>
    );
  }
  if (verdict === 'broken') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#f43f5e]">
        <AlertTriangle className="w-3 h-3" /> STILL BROKEN
      </span>
    );
  }
  if (verdict === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#fbbf24]">
        <AlertTriangle className="w-3 h-3" /> CALL FAILED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#64748b]">
      <CircleSlash className="w-3 h-3" /> NOT RUN
    </span>
  );
}

function verdictColor(verdict: ReturnType<typeof repairVerdict>): string {
  if (verdict === 'repaired') return 'text-[#34d399]';
  if (verdict === 'broken') return 'text-[#f43f5e]';
  if (verdict === 'error') return 'text-[#fbbf24]';
  return 'text-[#64748b]';
}

/**
 * The 08.1 capstone's four broken units, graded from the learner's `repair_*` functions.
 *
 * Nothing here is a local toggle: the numbers come from the Python runner's last run, so a
 * repair that returns the wrong angle keeps that angle's real tip error on the card.
 */
export const FaultBench08: React.FC<FaultBench08Props> = ({ report, grading, onGrade }) => {
  // The slider is the manual playground, not the graded repair: it applies its own correction
  // to the exact FK chord so the learner can see what "right" looks like before writing it.
  const [correctionRad, setCorrectionRad] = useState(0);

  const sliderError = zeroOffsetTipErrorMm(correctionRad);
  const repairedCount = countRepaired(report);
  const offsetVerdict = repairVerdict(report?.offset, FAULT_BENCH_TARGETS.offset);

  const currentPointX = chartX(correctionRad);
  const currentPointY = chartY(sliderError);

  return (
    <section
      data-testid="fault-bench-08-1"
      className="bg-[#111827] border border-[#334155] rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-[#38bdf8] flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span>08.1 Four-Fault Bench · grades your repairs</span>
          </div>
          <h3 className="text-base font-bold text-[#f1f5f9] mt-0.5">
            Run your four repair functions and watch each real metric land
          </h3>
          <p className="text-xs text-[#94a3b8] mt-0.5 max-w-3xl">
            These cards report what <b>your</b> <code className="font-mono">repair_*</code>{' '}
            functions actually return, computed with the bench's own forward kinematics: return
            the wrong angle and the tip error stays wrong. A unit is repaired below <b>1 mm</b>{' '}
            of tip error, or below <b>5%</b> overshoot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            data-testid="fault-bench-count"
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs tabular-nums ${
              repairedCount === 4
                ? 'bg-[#34d399]/15 border-[#34d399]/50 text-[#34d399]'
                : 'bg-[#0b0f19] border-[#334155] text-[#cbd5e1]'
            }`}
          >
            {repairedCount} / 4 repaired
          </div>
          <button
            onClick={() => setCorrectionRad(0)}
            data-testid="btn-fault-reset-all"
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#cbd5e1] border border-[#334155] flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset slider
          </button>
          <button
            onClick={onGrade}
            disabled={grading}
            data-testid="btn-fault-grade"
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 disabled:opacity-60 disabled:cursor-wait text-[#38bdf8] border border-[#38bdf8]/50 flex items-center gap-1.5 cursor-pointer"
          >
            {grading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {grading ? 'Grading…' : 'Grade my repairs'}
          </button>
        </div>
      </div>

      <div
        data-testid="fault-card-zero-offset"
        className={`rounded-lg border p-3 ${
          offsetVerdict === 'repaired'
            ? 'bg-[#06281f]/50 border-[#34d399]/50'
            : 'bg-[#0b0f19] border-[#334155]'
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-mono text-[#94a3b8]">Broken D · zero offset</div>
                <div className="text-sm font-semibold text-[#f1f5f9]">
                  Encoder has a constant 0.06 rad offset
                </div>
              </div>
              {statusBadge(offsetVerdict)}
            </div>

            <div
              data-testid="fault-metric-zero-offset"
              className={`mt-3 font-mono text-2xl font-bold tabular-nums ${verdictColor(offsetVerdict)}`}
            >
              {formatRepairMetric(report?.offset.value ?? null, 'mm')}
            </div>
            <div className="text-[11px] text-[#94a3b8] mt-0.5">
              your <code className="font-mono">repair_encoder_offset</code> · broken 12.00 mm ·
              target {formatRepairMetric(TIP_TARGET_MM, 'mm')}
            </div>
            {report?.offset.error && (
              <div className="text-[11px] font-mono text-[#fbbf24] mt-1 break-words">
                {report.offset.error}
              </div>
            )}

            <label
              htmlFor="fault-zero-offset-slider"
              className="mt-3 flex items-center justify-between text-[11px] font-mono text-[#cbd5e1]"
            >
              <span>Manual correction (playground)</span>
              <span className="text-[#38bdf8]">{correctionRad.toFixed(3)} rad</span>
            </label>
            <input
              id="fault-zero-offset-slider"
              data-testid="input-zero-offset-correction"
              type="range"
              min={0}
              max={ZERO_OFFSET_RAD}
              step={0.001}
              value={correctionRad}
              onChange={(event) => setCorrectionRad(Number(event.target.value))}
              aria-label="Manual zero-offset correction in radians"
              className="mt-1.5 w-full accent-[#38bdf8] cursor-pointer"
            />
            <div className="mt-1 text-[10px] font-mono text-[#64748b]">
              playground tip error {formatRepairMetric(sliderError, 'mm')} — the card above only
              turns green when your function does this
            </div>
          </div>

          <div className="lg:col-span-7">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              role="img"
              aria-label="Tip error falls from 12 mm to 0 as the manual zero-offset correction approaches 0.06 radians"
              className="w-full h-auto"
            >
              {[0, 6, 12].map((millimetres) => (
                <g key={millimetres}>
                  <line
                    x1={CHART_LEFT}
                    x2={CHART_RIGHT}
                    y1={chartY(millimetres)}
                    y2={chartY(millimetres)}
                    stroke="#1e293b"
                    strokeWidth="1"
                  />
                  <text
                    x={CHART_LEFT - 5}
                    y={chartY(millimetres) + 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {millimetres}
                  </text>
                </g>
              ))}
              <line
                x1={CHART_LEFT}
                x2={CHART_RIGHT}
                y1={chartY(1)}
                y2={chartY(1)}
                stroke="#34d399"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
              <text
                x={CHART_LEFT + 4}
                y={chartY(1) - 4}
                textAnchor="start"
                fill="#34d399"
                fontSize="9"
                fontFamily="monospace"
              >
                1 mm target
              </text>
              <polyline
                points={ZERO_CURVE.map(
                  (point) =>
                    `${chartX(point.correctionRad).toFixed(1)},${chartY(point.errorMm).toFixed(1)}`
                ).join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
              />
              <circle
                cx={currentPointX}
                cy={currentPointY}
                r="4"
                fill={sliderError <= TIP_TARGET_MM ? '#34d399' : '#f43f5e'}
                stroke="#0b0f19"
                strokeWidth="1.5"
              />
              {[0, ZERO_OFFSET_RAD / 2, ZERO_OFFSET_RAD].map((correction) => (
                <text
                  key={correction}
                  x={chartX(correction)}
                  y={CHART_BOTTOM + 14}
                  textAnchor={
                    correction === 0 ? 'start' : correction === ZERO_OFFSET_RAD ? 'end' : 'middle'
                  }
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {correction.toFixed(3)}
                </text>
              ))}
              <text
                x={(CHART_LEFT + CHART_RIGHT) / 2}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9"
                fontFamily="monospace"
              >
                correction (rad) · tip error (mm)
              </text>
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {BENCH_CARDS.map((fault) => {
          const metric = report?.[fault.id];
          const verdict = repairVerdict(metric, FAULT_BENCH_TARGETS[fault.id]);
          const value = metric?.value ?? null;
          const recoveredPct =
            value === null || fault.broken === 0
              ? 0
              : Math.max(0, Math.min(100, (1 - value / fault.broken) * 100));
          return (
            <div
              key={fault.id}
              data-testid={`fault-card-${fault.testId}`}
              className={`rounded-lg border p-3 ${
                verdict === 'repaired'
                  ? 'bg-[#06281f]/50 border-[#34d399]/50'
                  : 'bg-[#0b0f19] border-[#334155]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 h-4">
                <span className="text-[11px] font-mono text-[#94a3b8] truncate">{fault.badge}</span>
                <span className="shrink-0">{statusBadge(verdict)}</span>
              </div>
              <div className="text-sm font-semibold text-[#f1f5f9] mt-1 min-h-[2.5rem]">
                {fault.title}
              </div>

              <div
                data-testid={`fault-metric-${fault.testId}`}
                className={`mt-3 font-mono text-2xl font-bold tabular-nums ${verdictColor(verdict)}`}
              >
                {formatRepairMetric(value, fault.unit)}
              </div>
              <div className="text-[11px] text-[#94a3b8] mt-0.5">
                broken {formatRepairMetric(fault.broken, fault.unit)} · target ≤{' '}
                {formatRepairMetric(FAULT_BENCH_TARGETS[fault.id], fault.unit)}
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#34d399] transition-[width] duration-300"
                  style={{ width: `${recoveredPct}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] font-mono text-[#64748b]">
                {verdict === 'unrun'
                  ? 'not graded yet — press Grade my repairs'
                  : `${recoveredPct.toFixed(0)}% recovered by your repair`}
              </div>
              {metric?.error && (
                <div className="mt-1 text-[10px] font-mono text-[#fbbf24] break-words">
                  {metric.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[#64748b]">
        The bench computes each metric with its own two-link FK chord, not yours, and the
        anti-windup number runs the same 3000-step saturated PI loop as Lesson 05.1. These four
        metrics are the capstone's pass condition: <b className="text-[#cbd5e1]">Run &amp; Verify
        Output</b> only marks 08.1 verified when every card is at target, so a repair left at 1.20 mm
        keeps the lesson unverified however its printed line reads.
      </p>
    </section>
  );
};
