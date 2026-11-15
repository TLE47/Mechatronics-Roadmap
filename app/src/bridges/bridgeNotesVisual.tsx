import { Suspense, lazy } from 'react';
import type { ComponentType, ReactElement } from 'react';

/**
 * The Bridge Notes visuals and the one boundary that reaches them
 * (`app/src/bridges/bridgeNotesVisual.tsx`).
 *
 * A Bridge Notes section is where a lesson hands over to the next idea, and the ask is a small
 * interactive under every one of them. At this repository's weight that means the pictures must not
 * be in the entry chunk, so this module is only plumbing: a name-keyed table of `React.lazy`
 * components, each of which becomes its own chunk when Vite splits it. The *names* are not here —
 * a page's payload carries the one it carries (`generate_lesson_pages.py`, `resources/bridge-visuals.json`),
 * so a lesson without a visual costs no bytes and no fetch, and adding the fifty-sixth visual adds
 * nothing to the entry chunk.
 *
 * This module is itself loaded with `React.lazy` from the reader, so the table and the `Suspense`
 * below live in a chunk rather than in the entry: what the entry keeps is one dynamic import. A page
 * with a visual therefore costs two fetches (this table, then the picture) and a page without one
 * costs neither.
 */

const ScalingDials = lazy(() => import('./ScalingDialsVisual'));
const ClampCommand = lazy(() => import('./ClampCommandLab'));
const OrderOfOperations = lazy(() => import('./OrderOfOperationsLab'));
const StringSum = lazy(() => import('./StringSumLab'));
const PrefixShift = lazy(() => import('./PrefixShiftLab'));
const FreqBits = lazy(() => import('./FreqBitsLab'));
const RadianConvert = lazy(() => import('./RadianConvertLab'));
const LeverCos = lazy(() => import('./LeverCosLab'));
const GearSquared = lazy(() => import('./GearSquaredLab'));
const SignFlip = lazy(() => import('./SignFlipLab'));
const ClampFunction = lazy(() => import('./ClampFunctionLab'));
const AssertGuard = lazy(() => import('./AssertGuardLab'));
const AnswerCheck = lazy(() => import('./AnswerCheckLab'));
const DatasheetLimits = lazy(() => import('./DatasheetLimitsLab'));
const RegulatorBudget = lazy(() => import('./RegulatorBudgetLab'));
const TimerWrap = lazy(() => import('./TimerWrapLab'));
const PointerBox = lazy(() => import('./PointerBoxLab'));
const LagPower = lazy(() => import('./LagPowerLab'));
const WaterAnalogue = lazy(() => import('./WaterAnalogueLab'));
const CountRate = lazy(() => import('./CountRateLab'));
const Accumulate = lazy(() => import('./AccumulateLab'));
const StateSlots = lazy(() => import('./StateSlotsLab'));
const MatrixTick = lazy(() => import('./MatrixTickLab'));
const ArrowMultiply = lazy(() => import('./ArrowMultiplyLab'));
const Bringup = lazy(() => import('./BringupLab'));
const BeltGeometry = lazy(() => import('./BeltGeometryLab'));
const MassSpring = lazy(() => import('./MassSpringLab'));
const RcFilter = lazy(() => import('./RcFilterLab'));
const ElectricalAngle = lazy(() => import('./ElectricalAngleLab'));
const PidWindup = lazy(() => import('./PidWindupLab'));
const ComplementaryImu = lazy(() => import('./ComplementaryImuLab'));
const CubicTrajectory = lazy(() => import('./CubicTrajectoryLab'));
const CapstoneFrame = lazy(() => import('./CapstoneFrameLab'));
const FlybackSpike = lazy(() => import('./FlybackSpikeLab'));
const RcCharge = lazy(() => import('./RcChargeLab'));

const VISUALS: Record<string, ComponentType> = {
  'scaling-dials': ScalingDials,
  'clamp-command': ClampCommand,
  'order-of-operations': OrderOfOperations,
  'string-sum': StringSum,
  'prefix-shift': PrefixShift,
  'freq-bits': FreqBits,
  'radian-convert': RadianConvert,
  'lever-cos': LeverCos,
  'gear-squared': GearSquared,
  'sign-flip': SignFlip,
  'clamp-function': ClampFunction,
  'assert-guard': AssertGuard,
  'answer-check': AnswerCheck,
  'datasheet-limits': DatasheetLimits,
  'regulator-budget': RegulatorBudget,
  'timer-wrap': TimerWrap,
  'pointer-box': PointerBox,
  'lag-power': LagPower,
  'water-analogue': WaterAnalogue,
  'count-rate': CountRate,
  'accumulate': Accumulate,
  'state-slots': StateSlots,
  'matrix-tick': MatrixTick,
  'arrow-multiply': ArrowMultiply,
  'bringup': Bringup,
  'belt-geometry': BeltGeometry,
  'mass-spring': MassSpring,
  'rc-filter': RcFilter,
  'electrical-angle': ElectricalAngle,
  'pid-windup': PidWindup,
  'complementary-imu': ComplementaryImu,
  'cubic-trajectory': CubicTrajectory,
  'capstone-frame': CapstoneFrame,
  'flyback-spike': FlybackSpike,
  'rc-charge': RcCharge,
};

/**
 * The visual the payload named, or nothing.
 *
 * Each fallback is an empty, hidden marker rather than nothing at all: the section's own text is
 * already on screen, so a spinner would be a promise to move something the reader has not asked to
 * move yet, but the *pending* state still has to be visible to anything comparing one render with
 * another. This module's own boundary in `LessonReader` draws the same marker.
 */
export default function BridgeNotesVisual({ name }: { name: string }): ReactElement | null {
  const Visual = VISUALS[name];
  if (!Visual) return null;
  return (
    <Suspense fallback={<span data-testid="bridge-visual-pending" hidden />}>
      <div data-testid={`bridge-visual-${name}`}>
        <Visual />
      </div>
    </Suspense>
  );
}
