import type { LandmarkKey } from '../../learningPath';

/**
 * The city's landmarks (`app/src/components/learningPath/Landmarks.tsx`).
 *
 * One inline SVG per lesson kind, drawn from the theme's tokens, so both palettes and the paper
 * theme keep working and the page ships no raster art. A lesson without dedicated art gets its
 * region's tower: the platform is never blank.
 *
 * The silhouettes are deliberately different at a glance — stacked drums, an operator slab, a
 * drafting board, a forked arch, a slabbed library with a loop, a factory with an arm — because the
 * brief's core principle is that a learner can tell what a platform teaches without reading its
 * label. Changing one structure never touches the layout: the registry is keyed by `LandmarkKey`.
 */

const SHARED = 'lp-art';

function TowerBase({ x = 30, y = 126, width = 60 }: { x?: number; y?: number; width?: number }) {
  return <rect className={`${SHARED}-base`} x={x} y={y} width={width} height="10" rx="3" />;
}

function StorageTower() {
  return (
    <>
      <TowerBase />
      <rect className={`${SHARED}-base`} x="38" y="100" width="44" height="24" rx="6" />
      <rect className={`${SHARED}-soft`} x="34" y="74" width="52" height="22" rx="6" />
      <rect className={`${SHARED}-base`} x="42" y="52" width="36" height="18" rx="6" />
      <rect className={`${SHARED}-accent`} x="44" y="107" width="10" height="4" rx="2" />
      <rect className={`${SHARED}-accent`} x="58" y="107" width="16" height="4" rx="2" />
      <rect className={`${SHARED}-light`} x="42" y="80" width="10" height="4" rx="2" />
      <rect className={`${SHARED}-light`} x="56" y="80" width="10" height="4" rx="2" />
      <path className={`${SHARED}-line`} d="M60 52V38" />
      <circle className={`${SHARED}-light`} cx="60" cy="34" r="3" />
    </>
  );
}

function OperatorTower() {
  return (
    <>
      <TowerBase />
      <rect className={`${SHARED}-base`} x="42" y="30" width="36" height="96" rx="4" />
      <path className={`${SHARED}-line`} d="M60 30V18" />
      <circle className={`${SHARED}-light`} cx="60" cy="15" r="3" />
      {/* plus */}
      <rect className={`${SHARED}-accent`} x="54" y="48" width="12" height="4" rx="1" />
      <rect className={`${SHARED}-accent`} x="58" y="44" width="4" height="12" rx="1" />
      {/* times */}
      <g transform="rotate(45 60 82)">
        <rect className={`${SHARED}-light`} x="54" y="80" width="12" height="4" rx="1" />
        <rect className={`${SHARED}-light`} x="58" y="76" width="4" height="12" rx="1" />
      </g>
      <rect className={`${SHARED}-soft`} x="48" y="104" width="24" height="10" rx="2" />
    </>
  );
}

function BlueprintTower() {
  return (
    <>
      <TowerBase />
      <rect className={`${SHARED}-base`} x="48" y="78" width="24" height="48" rx="3" />
      <polygon className={`${SHARED}-soft`} points="26,34 94,42 94,84 26,76" />
      <path className={`${SHARED}-line`} d="M34 42H86M34 52H86M34 62H70" />
      <rect className={`${SHARED}-accent`} x="76" y="66" width="12" height="10" rx="2" />
      <path className={`${SHARED}-accent`} d="M78 76l2 6 4-6" />
      <circle className={`${SHARED}-light`} cx="79" cy="71" r="1.5" />
      <circle className={`${SHARED}-light`} cx="84" cy="71" r="1.5" />
    </>
  );
}

function BranchArch() {
  return (
    <>
      <TowerBase x={34} />
      <rect className={`${SHARED}-base`} x="52" y="96" width="16" height="30" rx="3" />
      <path className={`${SHARED}-base`} d="M60 100L34 58l12-6 14 42z" />
      <path className={`${SHARED}-base`} d="M60 100l26-42-12-6-14 42z" />
      <polygon className={`${SHARED}-accent`} points="34,52 44,40 54,52 44,64" />
      <polygon className={`${SHARED}-light`} points="66,52 76,40 86,52 76,64" />
      <circle className={`${SHARED}-light`} cx="60" cy="112" r="4" />
    </>
  );
}

function LibraryRing() {
  return (
    <>
      <TowerBase />
      <rect className={`${SHARED}-base`} x="34" y="102" width="52" height="12" rx="2" />
      <rect className={`${SHARED}-soft`} x="38" y="88" width="44" height="12" rx="2" />
      <rect className={`${SHARED}-base`} x="42" y="74" width="36" height="12" rx="2" />
      <circle className={`${SHARED}-ring`} cx="60" cy="46" r="20" />
      <polygon className={`${SHARED}-accent`} points="60,20 70,30 60,36" />
      <rect className={`${SHARED}-light`} x="46" y="44" width="28" height="4" rx="2" />
    </>
  );
}

function RobotFactory() {
  return (
    <>
      <TowerBase />
      <rect className={`${SHARED}-base`} x="30" y="82" width="60" height="44" rx="3" />
      <path className={`${SHARED}-soft`} d="M30 82l10-12 10 12 10-12 10 12 10-12 10 12z" />
      <rect className={`${SHARED}-accent`} x="40" y="94" width="14" height="10" rx="2" />
      <rect className={`${SHARED}-soft`} x="62" y="94" width="18" height="10" rx="2" />
      <rect className={`${SHARED}-line`} x="76" y="66" width="4" height="16" />
      <rect className={`${SHARED}-line`} x="76" y="62" width="18" height="4" rx="2" />
      <path className={`${SHARED}-accent`} d="M91 62v6m0 0l-4 4m4-4l4 4" />
      <circle className={`${SHARED}-light`} cx="36" cy="70" r="3" />
    </>
  );
}

function DataVault() {
  return (
    <>
      <TowerBase x={30} width={60} />
      <rect className={`${SHARED}-base`} x="32" y="44" width="56" height="82" rx="6" />
      <circle className={`${SHARED}-soft`} cx="60" cy="84" r="19" />
      <circle className={`${SHARED}-ring`} cx="60" cy="84" r="9" />
      <path className={`${SHARED}-line`} d="M60 65v7M60 96v7M41 84h7M72 84h7" />
      <rect className={`${SHARED}-accent`} x="42" y="52" width="36" height="5" rx="2" />
      <circle className={`${SHARED}-light`} cx="48" cy="116" r="3" />
      <circle className={`${SHARED}-light`} cx="58" cy="116" r="3" />
    </>
  );
}

function CircuitYard() {
  return (
    <>
      <TowerBase x={24} width={72} />
      <rect className={`${SHARED}-base`} x="24" y="64" width="72" height="62" rx="4" />
      <rect className={`${SHARED}-soft`} x="44" y="80" width="32" height="28" rx="3" />
      <path className={`${SHARED}-line`} d="M32 72h20v8M68 88h20v14M32 110h12M88 72v16h-8" />
      <circle className={`${SHARED}-accent`} cx="52" cy="110" r="3" />
      <circle className={`${SHARED}-light`} cx="68" cy="72" r="2.5" />
      <circle className={`${SHARED}-light`} cx="78" cy="72" r="2.5" />
      <rect className={`${SHARED}-accent`} x="50" y="88" width="20" height="4" rx="2" />
    </>
  );
}

function PowerStation() {
  return (
    <>
      <TowerBase x={34} width={52} />
      <rect className={`${SHARED}-base`} x="38" y="46" width="44" height="80" rx="5" />
      <rect className={`${SHARED}-soft`} x="46" y="58" width="28" height="22" rx="2" />
      <path className={`${SHARED}-accent`} d="M61 59l-9 14h8l-4 12 13-16h-8z" />
      <rect className={`${SHARED}-light`} x="46" y="90" width="28" height="4" rx="2" />
      <rect className={`${SHARED}-soft`} x="46" y="100" width="28" height="10" rx="2" />
      <path className={`${SHARED}-line`} d="M60 46V33" />
      <circle className={`${SHARED}-light`} cx="60" cy="30" r="3" />
    </>
  );
}

function SensorRig() {
  return (
    <>
      <TowerBase x={32} width={56} />
      <path className={`${SHARED}-line`} d="M60 94L38 126M60 94l22 32M60 94v32" />
      <ellipse className={`${SHARED}-soft`} cx="60" cy="66" rx="30" ry="15" transform="rotate(-18 60 66)" />
      <path className={`${SHARED}-line`} d="M60 80v14" />
      <path className={`${SHARED}-accent`} d="M86 52a32 32 0 0 1 6 16" />
      <path className={`${SHARED}-accent`} d="M92 46a42 42 0 0 1 7 22" />
      <circle className={`${SHARED}-light`} cx="60" cy="66" r="3" />
    </>
  );
}

function AssemblyGantry() {
  return (
    <>
      <TowerBase x={22} width={76} />
      <rect className={`${SHARED}-base`} x="28" y="54" width="10" height="72" rx="2" />
      <rect className={`${SHARED}-base`} x="82" y="54" width="10" height="72" rx="2" />
      <rect className={`${SHARED}-soft`} x="28" y="46" width="64" height="9" rx="2" />
      <path className={`${SHARED}-line`} d="M60 55v22" />
      <path className={`${SHARED}-accent`} d="M51 78h18l-4 9h-10z" />
      <circle className={`${SHARED}-light`} cx="60" cy="90" r="4" />
      <circle className={`${SHARED}-light`} cx="60" cy="100" r="2" />
    </>
  );
}

function ControlObservatory() {
  return (
    <>
      <TowerBase x={26} width={68} />
      <path className={`${SHARED}-base`} d="M30 118a30 30 0 0 1 60 0z" />
      <path className={`${SHARED}-accent`} d="M42 100c6-12 12-12 18 0s10 8 18-4" />
      <path className={`${SHARED}-line`} d="M60 88V74M52 80h16" />
      <rect className={`${SHARED}-soft`} x="46" y="108" width="28" height="10" rx="2" />
      <circle className={`${SHARED}-light`} cx="60" cy="71" r="3" />
    </>
  );
}

function AutonomyDome() {
  return (
    <>
      <TowerBase x={28} width={64} />
      <path className={`${SHARED}-base`} d="M30 118a30 30 0 0 1 60 0z" />
      <path className={`${SHARED}-line`} d="M42 100l18-14 18 14M36 110l24-20 24 20M60 86v32" />
      <circle className={`${SHARED}-accent`} cx="60" cy="80" r="5" />
      <path className={`${SHARED}-line`} d="M60 74V60" />
      <circle className={`${SHARED}-light`} cx="60" cy="57" r="3" />
    </>
  );
}

function CapstoneSpire() {
  return (
    <>
      <TowerBase x={32} width={56} />
      <path className={`${SHARED}-base`} d="M60 26l15 100H45z" />
      <ellipse className={`${SHARED}-ring`} cx="60" cy="74" rx="23" ry="7" />
      <circle className={`${SHARED}-light`} cx="60" cy="28" r="4" />
      <rect className={`${SHARED}-accent`} x="54" y="96" width="12" height="6" rx="2" />
      <path className={`${SHARED}-line`} d="M38 126h44" />
    </>
  );
}

function ModelArch() {
  return (
    <>
      <TowerBase x={30} width={60} />
      <path className={`${SHARED}-base`} d="M36 126V70a24 24 0 0 1 48 0v56h-10V70a14 14 0 0 0-28 0v56z" />
      <path className={`${SHARED}-accent`} d="M46 92h28M46 100h28M46 108h28" />
      <circle className={`${SHARED}-ring`} cx="60" cy="44" r="9" />
      <rect className={`${SHARED}-soft`} x="30" y="112" width="60" height="8" rx="2" />
    </>
  );
}

function RegionTower() {
  return (
    <>
      <TowerBase />
      <rect className={`${SHARED}-base`} x="40" y="58" width="40" height="68" rx="4" />
      <rect className={`${SHARED}-soft`} x="48" y="38" width="24" height="22" rx="4" />
      <path className={`${SHARED}-line`} d="M60 38V24" />
      <circle className={`${SHARED}-light`} cx="60" cy="21" r="3" />
      <rect className={`${SHARED}-accent`} x="46" y="72" width="8" height="8" rx="2" />
      <rect className={`${SHARED}-light`} x="58" y="72" width="8" height="8" rx="2" />
      <rect className={`${SHARED}-soft`} x="46" y="86" width="28" height="6" rx="2" />
    </>
  );
}

const ART: Record<LandmarkKey, () => React.JSX.Element> = {
  'storage-tower': StorageTower,
  'operator-tower': OperatorTower,
  'blueprint-tower': BlueprintTower,
  'branch-arch': BranchArch,
  'library-ring': LibraryRing,
  'robot-factory': RobotFactory,
  'data-vault': DataVault,
  'circuit-yard': CircuitYard,
  'power-station': PowerStation,
  'sensor-rig': SensorRig,
  'assembly-gantry': AssemblyGantry,
  'control-observatory': ControlObservatory,
  'autonomy-dome': AutonomyDome,
  'capstone-spire': CapstoneSpire,
  'model-arch': ModelArch,
  'region-tower': RegionTower,
};

export function Landmark({ kind, locked }: { kind: LandmarkKey; locked: boolean }) {
  const Art = ART[kind] ?? RegionTower;
  return (
    <svg
      className={`${SHARED}${locked ? ` ${SHARED}--locked` : ''}`}
      viewBox="0 0 120 140"
      role="presentation"
      focusable="false"
      data-landmark={kind}
      aria-hidden="true"
    >
      <Art />
    </svg>
  );
}
