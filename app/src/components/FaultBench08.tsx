import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Wrench } from 'lucide-react';
import {
  CPR_SCALE,
  ZERO_OFFSET_RAD,
  antiWindupOvershootPct,
  cprTipErrorMm,
  gravityTipErrorMm,
  zeroOffsetCurve,
  zeroOffsetTipErrorMm,
} from '../faultBench';

type ToggleFaultId = 'cpr' | 'antiWindup' | 'gravity';
type MetricUnit = 'mm' | '%';

interface ToggleFaultSpec {
  id: ToggleFaultId;
  badge: string;
  title: string;
  before: number;
  after: number;
  unit: MetricUnit;
  testId: string;
}

const ZERO_CURVE = zeroOffsetCurve(24);
const ANTI_WINDUP_BEFORE = antiWindupOvershootPct(false);
const ANTI_WINDUP_AFTER = antiWindupOvershootPct(true);

const TOGGLE_FAULTS: ToggleFaultSpec[] = [
  {
    id: 'cpr',
    badge: 'Broken B · CPR scale',
    title: 'Encoder reports 4× the true angle',
    before: cprTipErrorMm(1),
    after: cprTipErrorMm(CPR_SCALE),
    unit: 'mm',
    testId: 'cpr',
  },
  {
    id: 'antiWindup',
    badge: 'Broken C · anti-windup',
    title: 'Integral keeps charging while clipped',
    before: ANTI_WINDUP_BEFORE,
    after: ANTI_WINDUP_AFTER,
    unit: '%',
    testId: 'anti-windup',
  },
  {
    id: 'gravity',
    badge: 'Broken A · gravity sign',
    title: 'Feedforward command is inverted',
    before: gravityTipErrorMm(false),
    after: gravityTipErrorMm(true),
    unit: 'mm',
    testId: 'gravity',
  },
];

function formatMetric(value: number, unit: MetricUnit): string {
  if (unit === '%') return `${value.toFixed(1)}%`;
  return value < 0.005 ? '0.00 mm' : `${value.toFixed(1)} mm`;
}

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

function statusBadge(fixed: boolean): React.ReactNode {
  return fixed ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#34d399]">
      <CheckCircle2 className="w-3 h-3" /> REPAIRED
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#f43f5e]">
      <AlertTriangle className="w-3 h-3" /> BROKEN
    </span>
  );
}

/** The 08.1 capstone's four broken units, exercised against the same metrics as its proof lines. */
export const FaultBench08: React.FC = () => {
  const [fixed, setFixed] = useState<Record<ToggleFaultId, boolean>>({
    cpr: false,
    antiWindup: false,
    gravity: false,
  });
  const [correctionRad, setCorrectionRad] = useState(0);

  const offsetFixed = Math.abs(correctionRad - ZERO_OFFSET_RAD) < 0.0005;
  const offsetError = zeroOffsetTipErrorMm(correctionRad);
  const repairedCount =
    Number(offsetFixed) + Number(fixed.cpr) + Number(fixed.antiWindup) + Number(fixed.gravity);

  const toggleFault = (id: ToggleFaultId) => {
    setFixed((previous) => ({ ...previous, [id]: !previous[id] }));
  };

  const resetBench = () => {
    setFixed({ cpr: false, antiWindup: false, gravity: false });
    setCorrectionRad(0);
  };

  const currentPointX = chartX(correctionRad);
  const currentPointY = chartY(offsetError);

  return (
    <section
      data-testid="fault-bench-08-1"
      className="bg-[#111827] border border-[#334155] rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-[#38bdf8] flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span>08.1 Four-Fault Bench · interactive</span>
          </div>
          <h3 className="text-base font-bold text-[#f1f5f9] mt-0.5">
            Toggle a broken unit and watch its metric recover
          </h3>
          <p className="text-xs text-[#94a3b8] mt-0.5 max-w-3xl">
            These are the same tip-error and overshoot checks the page prints: repair each cause,
            not the label. The green target is below <b>1 mm</b> for tip errors and below{' '}
            <b>5%</b> for overshoot.
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
            onClick={resetBench}
            data-testid="btn-fault-reset-all"
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#cbd5e1] border border-[#334155] flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset bench
          </button>
        </div>
      </div>

      <div
        data-testid="fault-card-zero-offset"
        className={`rounded-lg border p-3 ${
          offsetFixed
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
              {statusBadge(offsetFixed)}
            </div>

            <div
              data-testid="fault-metric-zero-offset"
              className={`mt-3 font-mono text-2xl font-bold tabular-nums ${
                offsetFixed ? 'text-[#34d399]' : 'text-[#f43f5e]'
              }`}
            >
              {formatMetric(offsetError, 'mm')}
            </div>
            <div className="text-[11px] text-[#94a3b8] mt-0.5">
              broken 12.0 mm · target 0.00 mm
            </div>

            <label
              htmlFor="fault-zero-offset-slider"
              className="mt-3 flex items-center justify-between text-[11px] font-mono text-[#cbd5e1]"
            >
              <span>Correction applied</span>
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
              aria-label="Zero-offset correction in radians"
              className="mt-1.5 w-full accent-[#38bdf8] cursor-pointer"
            />
            <button
              onClick={() => setCorrectionRad(offsetFixed ? 0 : ZERO_OFFSET_RAD)}
              data-testid="btn-fault-zero-offset"
              className="mt-2 px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#38bdf8] border border-[#38bdf8]/40 cursor-pointer"
            >
              {offsetFixed ? 'Break it again' : 'Apply exact repair'}
            </button>
          </div>

          <div className="lg:col-span-7">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              role="img"
              aria-label="Tip error falls from 12 mm to 0 as the zero-offset correction approaches 0.06 radians"
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
                  (point) => `${chartX(point.correctionRad).toFixed(1)},${chartY(point.errorMm).toFixed(1)}`
                ).join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
              />
              <circle
                cx={currentPointX}
                cy={currentPointY}
                r="4"
                fill={offsetFixed ? '#34d399' : '#f43f5e'}
                stroke="#0b0f19"
                strokeWidth="1.5"
              />
              {[0, ZERO_OFFSET_RAD / 2, ZERO_OFFSET_RAD].map((correction) => (
                <text
                  key={correction}
                  x={chartX(correction)}
                  y={CHART_BOTTOM + 14}
                  textAnchor={correction === 0 ? 'start' : correction === ZERO_OFFSET_RAD ? 'end' : 'middle'}
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
        {TOGGLE_FAULTS.map((fault) => {
          const isFixed = fixed[fault.id];
          const current = isFixed ? fault.after : fault.before;
          const recoveredPct =
            fault.before === 0 ? 100 : Math.max(0, Math.min(100, (1 - current / fault.before) * 100));
          return (
            <div
              key={fault.id}
              data-testid={`fault-card-${fault.testId}`}
              className={`rounded-lg border p-3 ${
                isFixed ? 'bg-[#06281f]/50 border-[#34d399]/50' : 'bg-[#0b0f19] border-[#334155]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 h-4">
                <span className="text-[11px] font-mono text-[#94a3b8] truncate">{fault.badge}</span>
                <span className="shrink-0">{statusBadge(isFixed)}</span>
              </div>
              <div className="text-sm font-semibold text-[#f1f5f9] mt-1 min-h-[2.5rem]">
                {fault.title}
              </div>

              <div
                data-testid={`fault-metric-${fault.testId}`}
                className={`mt-3 font-mono text-2xl font-bold tabular-nums ${
                  isFixed ? 'text-[#34d399]' : 'text-[#f43f5e]'
                }`}
              >
                {formatMetric(current, fault.unit)}
              </div>
              <div className="text-[11px] text-[#94a3b8] mt-0.5">
                broken {formatMetric(fault.before, fault.unit)} · repaired{' '}
                {formatMetric(fault.after, fault.unit)}
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#34d399] transition-[width] duration-300"
                  style={{ width: `${recoveredPct}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] font-mono text-[#64748b]">
                {recoveredPct.toFixed(0)}% recovered
              </div>

              <button
                onClick={() => toggleFault(fault.id)}
                aria-pressed={isFixed}
                data-testid={`btn-fault-${fault.testId}`}
                className={`mt-3 w-full px-2.5 py-1.5 rounded text-[11px] font-mono font-bold border cursor-pointer ${
                  isFixed
                    ? 'bg-[#0b0f19] text-[#f43f5e] border-[#f43f5e]/40 hover:bg-[#f43f5e]/10'
                    : 'bg-[#34d399]/15 text-[#34d399] border-[#34d399]/40 hover:bg-[#34d399]/25'
                }`}
              >
                {isFixed ? 'Break it again' : 'Repair this unit'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[#64748b]">
        The zero-offset curve uses the exact two-link FK chord, not a small-angle approximation.
        The anti-windup metric runs the same 3000-step saturated PI loop as Lesson 05.1.
      </p>
    </section>
  );
};
