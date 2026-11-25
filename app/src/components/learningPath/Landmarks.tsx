import type { CSSProperties } from 'react';
import type { LandmarkKey } from '../../learningPath';
import { LandmarkRenderer } from './LandmarkRenderer.tsx';

/**
 * The city's landmarks (`app/src/components/learningPath/Landmarks.tsx`).
 *
 * Sixteen structures drawn as isometric volumes rather than flat elevations. A small kit — `Box`,
 * `Cyl`, `Dome`, window bays, roofs, trees and site furniture — keeps the light in one direction
 * (upper left), the shadows on one side (lower right) and every storey on the same projection, so a
 * data archive, a power station and a capstone spire belong to the same city.
 *
 * Each structure is still one inline SVG: no raster, no WebGL, no dependency. The palette comes from
 * the Learning Path's own CSS variables, which the platform's district theme can recolour without
 * redrawing the building.
 */

type V3 = [number, number, number];

const ORIGIN_X = 140;
const ORIGIN_Y = 211;
const SX = 1.18;
const SY = 0.46;

/** Isometric projection: x runs down-right, y down-left, z up. */
function project([x, y, z]: V3): [number, number] {
  return [ORIGIN_X + (x - y) * SX, ORIGIN_Y - z - (x + y) * SY];
}

function points(...vertices: V3[]): string {
  return vertices.map((vertex) => project(vertex).join(',')).join(' ');
}

interface BoxProps {
  x?: number;
  y?: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  tone?: string;
  className?: string;
}

/**
 * One extruded volume. The three visible faces are the top, the left-facing plane (+y) and the
 * right-facing plane (+x); CSS derives the shade from the single `--tone`, which keeps lighting
 * consistent across every structure.
 */
function Box({ x = 0, y = 0, z = 0, w, d, h, tone = '#efd2a2', className = '' }: BoxProps) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const y0 = y - d / 2;
  const y1 = y + d / 2;
  const z0 = z;
  const z1 = z + h;
  return (
    <g className={className} style={{ '--tone': tone } as CSSProperties}>
      <polygon
        className="lp-iso-left"
        points={points([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1])}
      />
      <polygon
        className="lp-iso-right"
        points={points([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1])}
      />
      <polygon
        className="lp-iso-top"
        points={points([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])}
      />
    </g>
  );
}

/** A round volume: storage tanks, rotundas, cooling towers, glass drums. */
function Cyl({
  x = 0,
  y = 0,
  z = 0,
  r,
  h,
  tone = '#efd2a2',
  taper = 0.82,
  className = '',
}: {
  x?: number;
  y?: number;
  z?: number;
  r: number;
  h: number;
  tone?: string;
  taper?: number;
  className?: string;
}) {
  const [sx, sy] = project([x, y, z]);
  const [, ty] = project([x, y, z + h]);
  const rx = r * 1.18;
  const ry = r * 0.55;
  const topRx = rx * taper;
  const topRy = ry * taper;
  return (
    <g className={className} style={{ '--tone': tone } as CSSProperties}>
      <ellipse className="lp-iso-bottom" cx={sx} cy={sy} rx={rx} ry={ry} />
      <polygon
        className="lp-iso-right"
        points={`${sx - rx},${ty} ${sx - rx},${sy} ${sx + rx},${sy} ${sx + topRx},${ty} ${sx - topRx},${ty}`}
      />
      <ellipse className="lp-iso-top" cx={sx} cy={ty} rx={topRx} ry={topRy} />
      <path
        className="lp-iso-highlight"
        d={`M ${sx - rx * 0.66} ${ty + 2} L ${sx - rx * 0.66} ${sy - 2}`}
      />
      <path
        className="lp-iso-line"
        d={`M ${sx - topRx} ${ty} A ${topRx} ${topRy} 0 0 0 ${sx + topRx} ${ty}`}
      />
    </g>
  );
}

/** A paneled dome for observatories, autonomy research and civic roofs. */
function Dome({
  x = 0,
  y = 0,
  z = 0,
  r,
  tone = '#efd2a2',
  ribs = 4,
}: {
  x?: number;
  y?: number;
  z?: number;
  r: number;
  tone?: string;
  ribs?: number;
}) {
  const [sx, sy] = project([x, y, z]);
  const rx = r * 1.22;
  const ry = r * 0.5;
  const lift = r * 0.82;
  return (
    <g style={{ '--tone': tone } as CSSProperties}>
      <path
        className="lp-iso-dome"
        d={`M ${sx - rx} ${sy} C ${sx - rx} ${sy - lift}, ${sx + rx} ${sy - lift}, ${sx + rx} ${sy} Z`}
      />
      <ellipse className="lp-iso-dome-base" cx={sx} cy={sy} rx={rx} ry={ry} />
      {Array.from({ length: ribs }, (_, index) => {
        const t = (index + 1) / (ribs + 1);
        return (
          <path
            key={index}
            className="lp-iso-line"
            d={`M ${sx - rx + rx * 2 * t} ${sy} C ${sx - rx + rx * 2 * t} ${sy - lift * 0.9}, ${
              sx + (rx * 2 * t - rx) * 0.35
            } ${sy - lift * 1.1}, ${sx} ${sy - lift}`}
          />
        );
      })}
      <ellipse className="lp-iso-dome-cap" cx={sx} cy={sy - lift} rx={rx * 0.14} ry={ry * 0.3} />
    </g>
  );
}

/** A pitched roof: a gabled hall or a workshop wing. */
function Roof({
  x = 0,
  y = 0,
  z,
  w,
  d,
  h,
  tone = '#e8876d',
}: {
  x?: number;
  y?: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tone?: string;
}) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const y0 = y - d / 2;
  const y1 = y + d / 2;
  return (
    <g style={{ '--tone': tone } as CSSProperties}>
      <polygon
        className="lp-iso-left"
        points={points([x0, y1, z], [x1, y1, z], [x1, y, z + h], [x0, y, z + h])}
      />
      <polygon
        className="lp-iso-top"
        points={points([x0, y, z + h], [x1, y, z + h], [x1, y0, z], [x0, y0, z])}
      />
      <polygon
        className="lp-iso-right"
        points={points([x1, y1, z], [x1, y0, z], [x1, y, z + h])}
      />
    </g>
  );
}

/** A sawtooth factory roof, repeated along x. */
function SawRoof({
  x = 0,
  y = 0,
  z,
  w,
  d,
  h,
  teeth = 3,
}: {
  x?: number;
  y?: number;
  z: number;
  w: number;
  d: number;
  h: number;
  teeth?: number;
}) {
  const pitch = w / teeth;
  return (
    <g>
      {Array.from({ length: teeth }, (_, index) => {
        const left = x - w / 2 + pitch * index;
        const right = left + pitch;
        return (
          <g key={index}>
            <polygon
              className="lp-iso-top"
              style={{ '--tone': index % 2 ? '#f7d36b' : '#f1e2c8' } as CSSProperties}
              points={points(
                [left, y - d / 2, z],
                [right, y - d / 2, z],
                [right, y - d / 2, z + h],
                [left, y - d / 2, z + h]
              )}
            />
            <polygon
              className="lp-iso-left"
              style={{ '--tone': '#f3c85d' } as CSSProperties}
              points={points(
                [right, y - d / 2, z],
                [right, y + d / 2, z],
                [right, y + d / 2, z + h],
                [right, y - d / 2, z + h]
              )}
            />
          </g>
        );
      })}
    </g>
  );
}

/** A row of windows on the left-facing (y = fixed) plane. */
function WindowsY({
  x,
  y,
  z,
  w,
  rows,
  cols,
  step = 10,
  width = 6,
  height = 5,
  start = 8,
  alt = false,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  rows: number;
  cols: number;
  step?: number;
  width?: number;
  height?: number;
  start?: number;
  alt?: boolean;
}) {
  const gap = (w - cols * width) / (cols + 1);
  return (
    <g>
      {Array.from({ length: rows * cols }, (_, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const x0 = x - w / 2 + gap + col * (width + gap);
        const x1 = x0 + width;
        const z0 = z + start + row * step;
        const z1 = z0 + height;
        return (
          <polygon
            key={`${row}-${col}`}
            className={alt && (row + col) % 4 === 0 ? 'lp-iso-window-teal' : 'lp-iso-window'}
            points={points([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1])}
          />
        );
      })}
    </g>
  );
}

/** A row of windows on the right-facing (x = fixed) plane. */
function WindowsX({
  x,
  y,
  z,
  d,
  rows,
  cols,
  step = 10,
  width = 5,
  height = 5,
  start = 8,
  alt = false,
}: {
  x: number;
  y: number;
  z: number;
  d: number;
  rows: number;
  cols: number;
  step?: number;
  width?: number;
  height?: number;
  start?: number;
  alt?: boolean;
}) {
  const gap = (d - cols * width) / (cols + 1);
  return (
    <g>
      {Array.from({ length: rows * cols }, (_, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const y0 = y - d / 2 + gap + col * (width + gap);
        const y1 = y0 + width;
        const z0 = z + start + row * step;
        const z1 = z0 + height;
        return (
          <polygon
            key={`${row}-${col}`}
            className={alt && (row + col) % 3 === 0 ? 'lp-iso-window-teal' : 'lp-iso-window'}
            points={points([x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1])}
          />
        );
      })}
    </g>
  );
}

/** Curved bands and lit portholes for a cylindrical facade. */
function CylDetails({
  x = 0,
  y = 0,
  z = 0,
  r,
  h,
  rows = 3,
}: {
  x?: number;
  y?: number;
  z?: number;
  r: number;
  h: number;
  rows?: number;
}) {
  const [sx, sy] = project([x, y, z]);
  const [, ty] = project([x, y, z + h]);
  const rx = r * 0.92;
  const step = (sy - ty) / (rows + 1);
  return (
    <g>
      {Array.from({ length: rows }, (_, row) => {
        const cy = ty + step * (row + 0.8);
        return (
          <g key={row}>
            <path className="lp-iso-line" d={`M ${sx - rx} ${cy} A ${rx} ${r * 0.4} 0 0 1 ${sx + rx} ${cy}`} />
            <rect
              className="lp-iso-window"
              x={sx - 10}
              y={cy - 4}
              width="6"
              height="5"
              rx="1"
            />
            <rect
              className="lp-iso-window-teal"
              x={sx + 4}
              y={cy - 4}
              width="6"
              height="5"
              rx="1"
            />
          </g>
        );
      })}
    </g>
  );
}

function Door({
  x,
  y,
  z = 0,
  w = 8,
  h = 14,
  tone = '#286f66',
}: {
  x: number;
  y: number;
  z?: number;
  w?: number;
  h?: number;
  tone?: string;
}) {
  return (
    <polygon
      className="lp-iso-door"
      style={{ '--tone': tone } as CSSProperties}
      points={points([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y, z + h], [x - w / 2, y, z + h])}
    />
  );
}

function Tree({ x, y, s = 1, tone = '#5da75f' }: { x: number; y: number; s?: number; tone?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-2" y="-15" width="4" height="17" rx="1.6" fill="#876444" />
      <circle cx="0" cy="-25" r="12" fill={tone} />
      <circle cx="-8" cy="-19" r="8" fill="#74b96b" />
      <circle cx="8" cy="-20" r="7" fill="#4f9254" />
      <circle cx="-3" cy="-30" r="5" fill="#91ca78" opacity="0.65" />
    </g>
  );
}

function Lamp({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-1" y="-17" width="2.5" height="18" rx="1" fill="#57756a" />
      <circle cx="0.5" cy="-19" r="4" fill="#ffe08a" />
      <circle cx="0.5" cy="-19" r="7" fill="#ffe08a" opacity="0.24" />
    </g>
  );
}

function Crate({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-8" y="-12" width="16" height="13" rx="1.5" fill="#d7b483" stroke="#2f5b4e" strokeWidth="1.3" />
      <path d="M-8 -4h16M0 -12v13" stroke="#a47c50" strokeWidth="1.2" />
    </g>
  );
}

function Antenna({ x, y, top, h }: { x: number; y: number; top: number; h: number }) {
  return (
    <g>
      <path className="lp-iso-mast" d={`M ${x} ${y} V ${y - h}`} />
      <path className="lp-iso-mast-thin" d={`M ${x - 12} ${y - h * 0.35} L ${x + 8} ${y - h * 0.62}`} />
      <circle className="lp-iso-beacon" cx={x} cy={y - h} r={top} />
      <circle className="lp-iso-beacon-halo" cx={x} cy={y - h} r={top * 3.2} />
    </g>
  );
}

function Steps({ x = 0, y = 24, w = 46, d = 20, levels = 3 }: { x?: number; y?: number; w?: number; d?: number; levels?: number }) {
  return (
    <g>
      {Array.from({ length: levels }, (_, index) => (
        <Box
          key={index}
          x={x}
          y={y + index * (d / levels) * 0.46}
          z={0}
          w={w - index * 5}
          d={d - index * 3}
          h={3.5 + index * 3}
          tone={index % 2 ? '#e8d6ba' : '#f1e2c9'}
        />
      ))}
    </g>
  );
}

function Shadow({ wide = 1 }: { wide?: number }) {
  return <ellipse className="lp-art-ground-shadow" cx="140" cy="231" rx={94 * wide} ry="15" />;
}

/* -------------------------------------------------------------------------------------------------
 * The sixteen structures.
 * ----------------------------------------------------------------------------------------------- */

function StorageTower() {
  return (
    <>
      <Shadow />
      <Box x={0} y={8} z={0} w={70} d={60} h={5} tone="#e7d4b5" />
      <Box x={-7} y={5} z={5} w={48} d={40} h={52} tone="#eccb9b" />
      <Box x={-2} y={1} z={57} w={34} d={29} h={28} tone="#f0d4a4" />
      <Box x={-2} y={1} z={85} w={36} d={31} h={3} tone="#f2c65c" />
      <Box x={25} y={16} z={5} w={18} d={24} h={38} tone="#59b9ad" />
      <Box x={-30} y={19} z={5} w={18} d={21} h={21} tone="#f0d69e" />
      <Cyl x={-24} y={-14} z={5} r={9} h={37} tone="#4cae9f" />
      <Cyl x={-7} y={14} z={0} r={5} h={10} tone="#e9c576" />
      <WindowsY x={-7} y={25} z={5} w={42} rows={4} cols={4} step={11} alt />
      <WindowsX x={17} y={5} z={5} d={34} rows={4} cols={3} step={11} />
      <WindowsY x={25} y={28} z={5} w={14} rows={3} cols={1} step={11} />
      <Door x={-20} y={25} z={5} w={7} h={13} />
      <polygon className="lp-iso-awning" points={points([-24, 25, 18], [-16, 25, 18], [-20, 28, 20])} />
      <path className="lp-iso-pipe" d="M 166 201v-30h18v-19" />
      <path className="lp-iso-pipe" d="M 177 201v-22h11" />
      <Antenna x={136} y={126} top={3.6} h={34} />
      <Tree x={50} y={232} s={0.85} />
      <Tree x={224} y={220} s={0.7} tone="#6cb267" />
      <Crate x={196} y={218} />
      <Lamp x={73} y={214} s={0.8} />
    </>
  );
}

function OperatorTower() {
  return (
    <>
      <Shadow />
      <Steps x={0} y={30} w={66} d={24} levels={3} />
      <Cyl x={0} y={0} z={9} r={24} h={70} tone="#d6a568" taper={0.9} />
      <Cyl x={0} y={0} z={79} r={18} h={16} tone="#93d8dd" taper={0.86} />
      <Cyl x={-25} y={-14} z={9} r={11} h={43} tone="#55b9ac" />
      <Box x={24} y={15} z={9} w={14} d={18} h={26} tone="#efce8d" />
      <Dome x={0} y={0} z={95} r={18} tone="#f6d16e" ribs={3} />
      {[28, 48, 68].map((ring) => {
        const [cx, cy] = project([0, 0, ring]);
        return (
          <ellipse
            key={ring}
            className="lp-iso-orbit"
            cx={cx}
            cy={cy}
            rx={31}
            ry={9}
            opacity={ring === 48 ? 0.9 : 0.55}
          />
        );
      })}
      <CylDetails x={0} y={0} z={9} r={21} h={70} rows={3} />
      <WindowsY x={24} y={24} z={9} w={10} rows={2} cols={1} step={14} width={5} height={6} />
      <WindowsX x={31} y={15} z={9} d={12} rows={2} cols={1} step={14} width={4} height={6} />
      <Door x={-4} y={24} z={9} w={8} h={15} tone="#276f65" />
      <path className="lp-iso-pipe" d="M 175 207v-42h-15" />
      <Antenna x={140} y={113} top={4.2} h={30} />
      <g transform="translate(202 150)">
        <circle className="lp-iso-planet" cx="0" cy="0" r="7" />
        <path className="lp-iso-planet-ring" d="M-14 2a14 6 0 0 0 28 0" />
      </g>
      <Tree x={55} y={232} s={0.8} />
      <Tree x={218} y={226} s={0.75} />
      <Lamp x={74} y={207} />
    </>
  );
}

function BlueprintTower() {
  return (
    <>
      <Shadow />
      <Box x={0} y={10} z={0} w={74} d={56} h={5} tone="#e6d4b7" />
      <Box x={-8} y={8} z={5} w={52} d={38} h={29} tone="#eccb9b" />
      <Roof x={-8} y={8} z={34} w={54} d={40} h={12} tone="#72c7c2" />
      <Box x={24} y={-10} z={5} w={22} d={22} h={67} tone="#e8c793" />
      <Box x={24} y={-10} z={72} w={26} d={26} h={4} tone="#f0c864" />
      <polygon className="lp-iso-glass" points={points([-34, 8, 34], [18, 8, 34], [18, 8, 49], [-34, 8, 49])} />
      <g className="lp-iso-blueprint" transform="translate(66 180)">
        <polygon points="0,0 62,-18 74,16 10,34" />
        <path d="M8 7l50-14M12 17l50-14M17 28l48-14M22 3l7 20M42 -1l7 20M60 -4l7 18" />
        <circle cx="34" cy="7" r="9" />
      </g>
      <WindowsY x={24} y={1} z={5} w={17} rows={4} cols={1} step={12} />
      <WindowsX x={35} y={-10} z={5} d={17} rows={4} cols={1} step={12} />
      <WindowsY x={-8} y={27} z={5} w={44} rows={2} cols={4} step={10} height={4} />
      <Door x={-22} y={27} z={5} w={8} h={12} tone="#2d746b" />
      <path className="lp-iso-pipe" d="M 182 126v-32h-11" />
      <g className="lp-iso-pencil" transform="translate(204 196) rotate(13)">
        <rect x="-3" y="0" width="6" height="42" rx="2" />
        <polygon points="-4,42 4,42 0,52" />
      </g>
      <Crate x={59} y={221} s={0.8} />
      <Tree x={224} y={226} s={0.72} />
      <Lamp x={196} y={219} s={0.8} />
    </>
  );
}

function BranchArch() {
  return (
    <>
      <Shadow />
      <Box x={0} y={12} z={0} w={84} d={54} h={5} tone="#e8d5b8" />
      <Box x={-28} y={8} z={5} w={20} d={24} h={56} tone="#eacb9b" />
      <Box x={28} y={8} z={5} w={20} d={24} h={56} tone="#5cb7ac" />
      <Box x={0} y={8} z={42} w={44} d={8} h={8} tone="#f0cf8b" />
      <Box x={0} y={8} z={55} w={32} d={6} h={5} tone="#eccb9b" />
      <Roof x={-28} y={8} z={61} w={23} d={27} h={18} tone="#e98268" />
      <Roof x={28} y={8} z={61} w={23} d={27} h={18} tone="#f0bf4f" />
      <polygon className="lp-iso-arch" points={points([-11, 20, 5], [11, 20, 5], [11, 20, 33], [-11, 20, 33])} />
      <polygon className="lp-iso-arch-inner" points={points([-7, 20, 5], [7, 20, 5], [7, 20, 26], [-7, 20, 26])} />
      <WindowsY x={-28} y={20} z={5} w={13} rows={3} cols={1} step={12} />
      <WindowsX x={-18} y={8} z={5} d={16} rows={3} cols={1} step={12} alt />
      <WindowsY x={28} y={20} z={5} w={13} rows={3} cols={1} step={12} />
      <path className="lp-iso-pipe" d="M 92 201c0-24 13-29 23-38M 191 201c0-19-11-26-18-31" />
      <g className="lp-iso-signal">
        <circle cx="91" cy="139" r="4" />
        <circle cx="188" cy="151" r="4" />
      </g>
      <Tree x={53} y={231} s={0.82} />
      <Tree x={226} y={224} s={0.7} />
      <Lamp x={196} y={216} s={0.76} />
    </>
  );
}

function LibraryRing() {
  return (
    <>
      <Shadow />
      <Steps x={0} y={32} w={72} d={25} levels={3} />
      <Cyl x={0} y={0} z={8} r={27} h={45} tone="#d6a568" taper={0.98} />
      <CylDetails x={0} y={0} z={8} r={25} h={45} rows={3} />
      <Cyl x={0} y={0} z={53} r={23} h={17} tone="#8fd7da" taper={0.94} />
      <Cyl x={0} y={0} z={70} r={19} h={9} tone="#f4ce6d" taper={0.92} />
      <Dome x={0} y={0} z={79} r={19} tone="#f0bd4f" ribs={5} />
      {[32, 46, 58].map((z) => {
        const [cx, cy] = project([0, 0, z]);
        return <ellipse key={z} className="lp-iso-shelf" cx={cx} cy={cy} rx={30} ry={9} />;
      })}
      <Box x={27} y={17} z={8} w={21} d={22} h={26} tone="#58b6aa" />
      <Roof x={27} y={17} z={34} w={22} d={23} h={8} tone="#e88468" />
      <g className="lp-iso-shelves">
        {Array.from({ length: 6 }, (_, index) => {
          const [sx, sy] = project([-33 + index * 4, 27, 12]);
          return <path key={index} d={`M ${sx} ${sy}v30`} />;
        })}
      </g>
      <WindowsY x={27} y={28} z={8} w={16} rows={2} cols={1} step={11} />
      <Box x={-46} y={19} z={7} w={38} d={9} h={3} tone="#e9d3b4" />
      <path className="lp-iso-line" d="M 83 207v-18M 104 205v-18" />
      <path className="lp-iso-ramp" d="M 76 208c4-9 16-13 29-13" />
      <Tree x={51} y={232} s={0.8} />
      <Tree x={221} y={228} s={0.65} />
      <Crate x={198} y={219} s={0.7} />
      <Lamp x={74} y={211} s={0.8} />
    </>
  );
}

function RobotFactory() {
  return (
    <>
      <Shadow wide={1.05} />
      <Box x={0} y={12} z={0} w={84} d={58} h={5} tone="#e7d5b8" />
      <Box x={-10} y={10} z={5} w={60} d={40} h={29} tone="#eccb9b" />
      <SawRoof x={-10} y={10} z={34} w={60} d={40} h={13} teeth={3} />
      <Box x={26} y={-12} z={5} w={20} d={22} h={23} tone="#58b6aa" />
      <Cyl x={31} y={-15} z={28} r={7} h={48} tone="#e9d3b4" taper={0.76} />
      <g className="lp-iso-steam" transform="translate(176 107)">
        <circle cx="0" cy="2" r="9" />
        <circle cx="12" cy="-8" r="7" />
        <circle cx="-8" cy="-13" r="6" />
        <circle cx="10" cy="-21" r="5" />
      </g>
      <WindowsY x={-10} y={30} z={5} w={50} rows={2} cols={4} step={12} height={5} />
      <Box x={-18} y={30} z={5} w={20} d={3} h={16} tone="#2e857c" />
      <Box x={3} y={30} z={5} w={16} d={3} h={14} tone="#9ddce3" />
      <Door x={16} y={30} z={5} w={9} h={15} tone="#c98d45" />
      <g className="lp-iso-crane" transform="translate(203 191)">
        <rect x="-4" y="-44" width="8" height="45" rx="2" />
        <rect x="0" y="-48" width="41" height="6" rx="2" />
        <path d="M4 -42l34 -1M10 -42l18 5" />
        <path d="M34 -42v18" />
        <path d="M28 0l6-18 6 18z" />
      </g>
      <g className="lp-iso-conveyor" transform="translate(78 203)">
        <rect x="0" y="0" width="60" height="5" rx="2" />
        <circle cx="9" cy="6" r="3" />
        <circle cx="31" cy="6" r="3" />
        <circle cx="53" cy="6" r="3" />
      </g>
      <Crate x={62} y={221} s={0.9} />
      <Crate x={83} y={224} s={0.65} />
      <Tree x={221} y={228} s={0.7} />
      <Lamp x={60} y={213} s={0.78} />
    </>
  );
}

function DataVault() {
  return (
    <>
      <Shadow wide={1.02} />
      <Box x={0} y={12} z={0} w={86} d={58} h={6} tone="#e3d0b2" />
      <Box x={0} y={8} z={6} w={64} d={42} h={34} tone="#e7c897" />
      <Box x={-34} y={16} z={6} w={16} d={26} h={22} tone="#d6b78f" />
      <Box x={34} y={16} z={6} w={16} d={26} h={22} tone="#d6b78f" />
      <Box x={0} y={7} z={36} w={54} d={34} h={18} tone="#59b6aa" />
      <Box x={0} y={7} z={55} w={42} d={27} h={5} tone="#f2ca65" />
      <ellipse className="lp-iso-vault-door" cx="143" cy="181" rx="22" ry="18" />
      <ellipse className="lp-iso-vault-ring" cx="143" cy="181" rx="16" ry="13" />
      <path className="lp-iso-vault-spoke" d="M143 165v32M127 181h32M132 170l22 22M154 170l-22 22" />
      <WindowsY x={0} y={24} z={36} w={44} rows={1} cols={3} step={10} width={7} height={5} />
      <g className="lp-iso-camera" transform="translate(190 149)">
        <rect x="0" y="0" width="9" height="6" rx="2" />
        <path d="M9 3l7-3v6z" />
        <circle cx="4" cy="6" r="1.6" />
      </g>
      <path className="lp-iso-pipe" d="M 92 208v-22h-12M 189 209v-19h13" />
      <Tree x={56} y={232} s={0.75} />
      <Tree x={224} y={224} s={0.68} />
      <Crate x={200} y={216} s={0.6} />
    </>
  );
}

function CircuitYard() {
  return (
    <>
      <Shadow wide={1.04} />
      <Box x={0} y={12} z={0} w={86} d={56} h={5} tone="#dfd2ba" />
      <Box x={-4} y={10} z={5} w={60} d={38} h={26} tone="#eacb9c" />
      <Box x={-4} y={10} z={31} w={58} d={36} h={5} tone="#80d1d3" />
      <Box x={-30} y={-5} z={5} w={20} d={22} h={51} tone="#59b8ac" />
      <Box x={-30} y={-5} z={56} w={22} d={24} h={4} tone="#f0c75e" />
      <Cyl x={22} y={-13} z={5} r={8} h={24} tone="#e8c36e" />
      <Cyl x={39} y={-13} z={5} r={8} h={18} tone="#66bfb4" />
      <g className="lp-iso-traces">
        <path d="M56 192h22v-18h15M64 202h27v9h19M48 207v-27h22" />
        <circle cx="93" cy="174" r="3" />
        <circle cx="110" cy="211" r="3" />
        <circle cx="70" cy="180" r="3" />
        <circle cx="48" cy="207" r="3" />
      </g>
      <g className="lp-iso-pylon" transform="translate(205 172)">
        <path d="M0 31V0M22 31V0M-4 24h30M-2 14h26M0 0l11 31 11-31" />
        <path d="M-9 24h40M-6 14h34" />
      </g>
      <path className="lp-iso-wire" d="M205 184c-28 10-52 13-88 8M227 184c30 4 35 12 35 22" />
      <WindowsY x={-30} y={6} z={5} w={14} rows={3} cols={1} step={12} />
      <WindowsY x={-4} y={29} z={5} w={48} rows={2} cols={4} step={12} height={5} />
      <Door x={16} y={29} z={5} w={9} h={14} tone="#2b7e74" />
      <Cyl x={-47} y={22} z={0} r={6} h={12} tone="#e6c879" />
      <Tree x={50} y={233} s={0.7} />
      <Lamp x={190} y={218} s={0.72} />
    </>
  );
}

function PowerStation() {
  return (
    <>
      <Shadow wide={1.05} />
      <Box x={8} y={16} z={0} w={82} d={54} h={5} tone="#e4d2b5" />
      <Box x={10} y={12} z={5} w={48} d={34} h={27} tone="#eacb9b" />
      <g>
        <polygon
          className="lp-iso-cooling"
          points="73,196 87,121 107,121 121,196"
        />
        <ellipse className="lp-iso-cooling-top" cx="97" cy="121" rx="10" ry="4" />
        <path className="lp-iso-cooling-band" d="M78 166h38M81 146h32" />
      </g>
      <g>
        <polygon
          className="lp-iso-cooling"
          points="160,196 171,133 188,133 199,196"
        />
        <ellipse className="lp-iso-cooling-top" cx="179.5" cy="133" rx="8.5" ry="3.5" />
        <path className="lp-iso-cooling-band" d="M164 171h32M166 152h27" />
      </g>
      <g className="lp-iso-steam" transform="translate(97 108)">
        <circle cx="0" cy="0" r="10" />
        <circle cx="14" cy="-11" r="8" />
        <circle cx="-8" cy="-14" r="7" />
        <circle cx="8" cy="-25" r="5" />
      </g>
      <Box x={18} y={12} z={32} w={40} d={28} h={4} tone="#f1c55a" />
      <g className="lp-iso-coils">
        <Cyl x={22} y={-7} z={5} r={5} h={20} tone="#e6c06a" />
        <Cyl x={40} y={-7} z={5} r={5} h={16} tone="#e6c06a" />
        <Cyl x={56} y={-7} z={5} r={5} h={12} tone="#e6c06a" />
      </g>
      <WindowsY x={10} y={29} z={5} w={38} rows={2} cols={3} step={12} height={5} />
      <Door x={-4} y={29} z={5} w={8} h={13} tone="#2c776d" />
      <polygon className="lp-iso-bolt" points="181,91 169,116 180,116 170,139 192,109 180,109 190,91" />
      <path className="lp-iso-wire" d="M33 181c-19-3-25 8-28 20M198 182c20-2 26 7 28 19" />
      <Tree x={48} y={234} s={0.68} />
      <Lamp x={211} y={220} s={0.7} />
    </>
  );
}

function SensorRig() {
  return (
    <>
      <Shadow />
      <Box x={0} y={18} z={0} w={70} d={48} h={5} tone="#e2d0b4" />
      <Box x={-16} y={18} z={5} w={32} d={26} h={19} tone="#e9c99a" />
      <Roof x={-16} y={18} z={24} w={33} d={27} h={7} tone="#60bcb0" />
      <Box x={0} y={4} z={5} w={18} d={18} h={42} tone="#e6c58f" />
      <g className="lp-iso-lattice" transform="translate(140 172)">
        <path d="M0 0V-78M-13 0l13-78 13 78M-13 0h26M-8 -28h16M-5 -52h10" />
        <rect x="-13" y="-83" width="26" height="7" rx="2" />
      </g>
      <g className="lp-iso-dish" transform="translate(140 88) rotate(-17)">
        <ellipse cx="0" cy="0" rx="22" ry="8" />
        <ellipse cx="0" cy="0" rx="14" ry="4.5" />
        <path d="M-22 0l-6 10M22 0l6 10M0 7v12" />
      </g>
      <path className="lp-iso-wave" d="M167 73c12-10 12-24 2-34M177 82c18-16 19-37 3-51" />
      <g className="lp-iso-pods">
        <circle cx="119" cy="144" r="5" />
        <circle cx="161" cy="151" r="4" />
        <circle cx="155" cy="130" r="3" />
      </g>
      <g className="lp-iso-solar" transform="translate(191 196)">
        <polygon points="0,0 28,-14 38,2 9,16" />
        <path d="M7 3l29-14M12 11l29-14M17 -2l5 12M27 -7l5 12M37 -12l5 12" />
      </g>
      <WindowsY x={0} y={13} z={5} w={14} rows={2} cols={1} step={11} />
      <WindowsY x={-16} y={31} z={5} w={24} rows={1} cols={2} step={10} height={5} />
      <path className="lp-iso-pipe" d="M 184 213v-24h-10" />
      <Tree x={55} y={232} s={0.72} />
      <Lamp x={197} y={224} s={0.7} />
    </>
  );
}

function AssemblyGantry() {
  return (
    <>
      <Shadow wide={1.1} />
      <Box x={0} y={16} z={0} w={90} d={58} h={5} tone="#dfd0b8" />
      <Box x={0} y={12} z={5} w={48} d={34} h={29} tone="#e9ca9c" />
      <Box x={0} y={12} z={34} w={50} d={36} h={4} tone="#d99b45" />
      <Box x={-9} y={4} z={38} w={17} d={18} h={2} tone="#7cc7ba" />
      <Box x={-38} y={8} z={5} w={11} d={12} h={62} tone="#e6d5bd" />
      <Box x={36} y={8} z={5} w={11} d={12} h={62} tone="#e6d5bd" />
      <Box x={0} y={8} z={64} w={84} d={12} h={8} tone="#c6a77d" />
      <Box x={0} y={8} z={72} w={36} d={10} h={4} tone="#f4cf74" />
      <path className="lp-iso-hoist" d="M140 148v44" />
      <g className="lp-iso-hook" transform="translate(140 198)">
        <path d="M0 0v8c0 7 10 7 10 0" />
      </g>
      <g className="lp-iso-steel" transform="translate(78 190)">
        <path d="M0 0l28-17 22 12-28 18zM0 0v23l22 17V23M50 -5v23L22 40" />
      </g>
      <g className="lp-iso-hazard">
        <path d="M65 218h38M70 211l29 15M99 211l-29 15" />
      </g>
      <WindowsY x={0} y={29} z={5} w={38} rows={2} cols={3} step={12} height={5} />
      <Door x={-14} y={29} z={5} w={8} h={14} tone="#2b776c" />
      <Crate x={194} y={218} s={0.85} />
      <Crate x={211} y={223} s={0.6} />
      <Tree x={56} y={235} s={0.65} />
      <Lamp x={174} y={220} s={0.75} />
    </>
  );
}

function ControlObservatory() {
  return (
    <>
      <Shadow wide={1.04} />
      <Steps x={0} y={30} w={74} d={24} levels={3} />
      <Box x={-4} y={12} z={9} w={52} d={34} h={25} tone="#eacb9b" />
      <Box x={-4} y={12} z={34} w={50} d={32} h={13} tone="#7dd0d0" />
      <Box x={-4} y={12} z={47} w={42} d={28} h={4} tone="#f0ca63" />
      <Dome x={-4} y={12} z={51} r={20} tone="#ead2ab" ribs={4} />
      <Box x={27} y={-3} z={9} w={17} d={17} h={52} tone="#58b6aa" />
      <Cyl x={27} y={-3} z={61} r={10} h={13} tone="#9ddce3" taper={0.9} />
      <Box x={27} y={-3} z={74} w={17} d={17} h={3} tone="#f1ca64" />
      <g className="lp-iso-dish" transform="translate(187 91) rotate(12)">
        <ellipse cx="0" cy="0" rx="20" ry="7" />
        <ellipse cx="0" cy="0" rx="12" ry="4" />
        <path d="M0 6v12" />
      </g>
      <g className="lp-iso-wave" transform="translate(31 112)">
        <path d="M0 0c-11-10-11-25 0-35M-10 8c-16-15-16-38 0-53" />
      </g>
      <WindowsY x={-4} y={29} z={9} w={42} rows={1} cols={3} step={10} height={6} />
      <WindowsY x={27} y={5} z={9} w={11} rows={3} cols={1} step={11} />
      <g className="lp-iso-console" transform="translate(143 190)">
        <rect x="-16" y="0" width="32" height="4" rx="2" />
        <path d="M-10 4v8M10 4v8" />
      </g>
      <Tree x={57} y={232} s={0.72} />
      <Tree x={224} y={222} s={0.65} />
      <Lamp x={196} y={213} s={0.7} />
    </>
  );
}

function AutonomyDome() {
  return (
    <>
      <Shadow wide={1.08} />
      <Box x={0} y={16} z={0} w={90} d={58} h={5} tone="#e4d4ba" />
      <Cyl x={-2} y={6} z={5} r={35} h={7} tone="#e4d3b4" taper={1} />
      <Dome x={-2} y={6} z={12} r={33} tone="#7cc7ba" ribs={5} />
      <circle className="lp-iso-beacon" cx={145} cy={173} r={3.2} />
      <circle className="lp-iso-beacon-halo" cx={145} cy={173} r={12} />
      <ellipse className="lp-iso-shelf" cx={145} cy={197} rx={40} ry={12} />
      <Box x={42} y={18} z={5} w={25} d={26} h={22} tone="#5bb8ac" />
      <Box x={42} y={18} z={27} w={27} d={28} h={3} tone="#f0c960" />
      <polygon className="lp-iso-bay" points={points([32, 30, 5], [52, 30, 5], [52, 30, 21], [32, 30, 21])} />
      <g className="lp-iso-rover" transform="translate(198 211)">
        <rect x="0" y="-13" width="24" height="9" rx="3" />
        <rect x="5" y="-18" width="12" height="6" rx="2" />
        <circle cx="5" cy="-2" r="4" />
        <circle cx="19" cy="-2" r="4" />
        <path d="M12 -18V-23" />
        <circle cx="12" cy="-25" r="2" />
      </g>
      <g className="lp-iso-solar" transform="translate(62 197)">
        <polygon points="0,0 27,-14 37,2 10,16" />
        <path d="M7 3l29-14M12 11l29-14M17 -2l5 12M27 -7l5 12M37 -12l5 12" />
      </g>
      <g className="lp-iso-drone" transform="translate(179 78)">
        <path d="M-14 5L14 -5M-14 -5L14 5" />
        <ellipse cx="-16" cy="6" rx="7" ry="2.5" />
        <ellipse cx="16" cy="-6" rx="7" ry="2.5" />
        <circle cx="0" cy="0" r="4" />
      </g>
      <g className="lp-iso-path" d="M 44 219c25-11 44-14 64-6" />
      <Tree x={54} y={234} s={0.7} />
      <Lamp x={224} y={220} s={0.7} />
    </>
  );
}

function CapstoneSpire() {
  return (
    <>
      <Shadow wide={1.14} />
      <Steps x={0} y={34} w={94} d={28} levels={3} />
      <Box x={-32} y={12} z={9} w={22} d={27} h={33} tone="#eacb9b" />
      <Box x={32} y={12} z={9} w={22} d={27} h={33} tone="#59b7ab" />
      <Box x={-32} y={12} z={42} w={24} d={29} h={4} tone="#f0c65c" />
      <Box x={32} y={12} z={42} w={24} d={29} h={4} tone="#f0c65c" />
      <Box x={0} y={8} z={9} w={25} d={25} h={90} tone="#efd2a2" />
      <Box x={0} y={8} z={99} w={21} d={21} h={20} tone="#8fd7da" />
      <Box x={0} y={8} z={119} w={17} d={17} h={17} tone="#f2cc66" />
      <Cyl x={0} y={8} z={136} r={5} h={25} tone="#f5d278" taper={0.28} />
      <Antenna x={140} y={71} top={4} h={28} />
      <ellipse className="lp-iso-orbit" cx="140" cy="86" rx="29" ry="8" opacity="0.72" />
      <ellipse className="lp-iso-orbit" cx="140" cy="139" rx="38" ry="10" opacity="0.45" />
      <circle className="lp-iso-beacon" cx="140" cy="73" r="4" />
      <circle className="lp-iso-beacon-halo" cx="140" cy="73" r="16" />
      <Box x={0} y={8} z={51} w={65} d={6} h={6} tone="#f0cc78" />
      <WindowsY x={0} y={20.5} z={9} w={20} rows={6} cols={2} step={13} width={4} height={7} />
      <WindowsX x={12.5} y={8} z={9} d={20} rows={6} cols={2} step={13} width={4} height={7} />
      <WindowsY x={-32} y={25.5} z={9} w={16} rows={2} cols={2} step={12} height={5} />
      <WindowsY x={32} y={25.5} z={9} w={16} rows={2} cols={2} step={12} height={5} />
      <g className="lp-iso-flags" transform="translate(58 184)">
        <path d="M0 0v-27M26 0v-20" />
        <polygon points="0,-27 12,-23 0,-19" />
        <polygon points="26,-20 37,-17 26,-14" />
      </g>
      <Tree x={54} y={236} s={0.85} />
      <Tree x={226} y={230} s={0.78} />
      <Lamp x={78} y={214} s={0.85} />
      <Lamp x={201} y={210} s={0.85} />
    </>
  );
}

function ModelArch() {
  return (
    <>
      <Shadow wide={1.04} />
      <Box x={0} y={16} z={0} w={84} d={56} h={5} tone="#e5d4ba" />
      <Box x={-20} y={12} z={5} w={28} d={26} h={28} tone="#e9ca9c" />
      <Box x={-20} y={12} z={33} w={30} d={28} h={4} tone="#f1c960" />
      <g className="lp-iso-arch-frame">
        <path d="M87 207V139c0-27 22-46 53-46s53 19 53 46v68" />
        <path d="M101 207v-66c0-19 17-32 39-32s39 13 39 32v66" />
        <path d="M87 139h28M178 139h28M115 173h50M115 191h50" />
      </g>
      <Box x={24} y={10} z={5} w={21} d={22} h={39} tone="#5ab7ab" />
      <Box x={24} y={10} z={44} w={23} d={24} h={4} tone="#f0c65c" />
      <g className="lp-iso-axis" transform="translate(68 202)">
        <path d="M0 0h45M0 0l-26 12M0 0v-35" />
        <polygon points="45,0 39,-3 39,3" />
        <polygon points="-26,12 -20,10 -22,16" />
        <polygon points="0,-35 -3,-29 3,-29" />
      </g>
      <g className="lp-iso-model" transform="translate(196 211)">
        <rect x="-15" y="0" width="30" height="4" rx="1" />
        <polygon points="-9,0 -9,-14 2,-19 2,-4" />
        <polygon points="2,0 2,-19 12,-13 12,0" />
        <path d="M2 -19v-9" />
      </g>
      <WindowsY x={-20} y={25} z={5} w={20} rows={2} cols={2} step={12} height={5} />
      <WindowsY x={24} y={21} z={5} w={14} rows={3} cols={1} step={11} />
      <g className="lp-iso-blueprint" transform="translate(73 187) rotate(-5)">
        <polygon points="0,0 32,-6 36,9 4,15" />
        <path d="M5 3l24-4M6 8l24-4" />
      </g>
      <Tree x={53} y={235} s={0.65} />
      <Tree x={226} y={224} s={0.62} />
    </>
  );
}

function RegionTower() {
  return (
    <>
      <Shadow />
      <Box x={0} y={16} z={0} w={74} d={50} h={5} tone="#e3d2b8" />
      <Box x={-4} y={10} z={5} w={42} d={34} h={35} tone="#e8c796" />
      <Box x={-4} y={10} z={40} w={31} d={27} h={30} tone="#5db9ad" />
      <Box x={-4} y={10} z={70} w={23} d={21} h={25} tone="#f0c75e" />
      <Roof x={-4} y={10} z={95} w={25} d={23} h={11} tone="#e78268" />
      <Box x={20} y={20} z={5} w={16} d={18} h={25} tone="#8fd7da" />
      <g className="lp-iso-clock" transform="translate(126 154)">
        <circle cx="0" cy="0" r="12" />
        <path d="M0 -7V0l5 3M-4 0h8" />
      </g>
      <g className="lp-iso-roof-garden" transform="translate(63 180)">
        <path d="M0 2c14-9 31-7 44 2" />
        <circle cx="8" cy="0" r="4" />
        <circle cx="20" cy="-4" r="5" />
        <circle cx="34" cy="0" r="4" />
        <circle cx="44" cy="3" r="3" />
      </g>
      <WindowsY x={-4} y={27} z={5} w={32} rows={2} cols={3} step={12} height={5} />
      <WindowsY x={-4} y={23.5} z={40} w={22} rows={1} cols={2} step={11} height={5} />
      <WindowsX x={7.5} y={10} z={5} d={26} rows={2} cols={2} step={12} height={5} />
      <Door x={-10} y={27} z={5} w={8} h={14} />
      <g className="lp-iso-canopy" transform="translate(185 205)">
        <rect x="0" y="0" width="33" height="4" rx="2" />
        <path d="M4 4v10M29 4v10" />
        <path d="M0 -4h33" />
      </g>
      <Tree x={52} y={233} s={0.7} />
      <Lamp x={198} y={215} s={0.72} />
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
  return <LandmarkRenderer kind={kind} locked={locked} art={Art} />;
}
