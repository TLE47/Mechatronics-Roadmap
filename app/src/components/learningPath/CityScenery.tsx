import React from 'react';
import type { PathRegionId } from '../../learningPathRegions';

/**
 * The city's scenery (`components/learningPath/CityScenery.tsx`).
 *
 * Three layers, painted in order: the sky and its distant mountains/skyline, the ground pattern
 * with fields, water and far workshops, then each district's own middle-ground campus, trees, ponds
 * and footbridges. Platform art and lesson labels sit above all of it. Every layer is decorative and
 * `aria-hidden`; the only interactive things in the city are the lesson platforms.
 *
 * A district has a visual identity as well as a curriculum one. `districtTheme` maps the registry's
 * track or module subject onto the same ten identities the platform and scenery use, so Python is a
 * data campus, mathematics an observatory quarter, mechanics a gantry works and the capstone a
 * research complex — without inventing a second curriculum model.
 */

export type DistrictTheme =
  | 'python'
  | 'math'
  | 'circuits'
  | 'mechanics'
  | 'robotics'
  | 'embedded'
  | 'sensors'
  | 'control'
  | 'systems'
  | 'capstone';

const THEME_BY_DISTRICT: Record<string, DistrictTheme> = {
  'track-p': 'python',
  ramp: 'math',
  'stage-0': 'circuits',
  '00-foundations': 'math',
  '01-electronics-and-power': 'circuits',
  '02-mechanics-kinematics-dynamics': 'mechanics',
  '03-sensors-and-actuators': 'sensors',
  '04-embedded-and-realtime': 'embedded',
  '05-control-and-estimation': 'control',
  '06-robotics-and-autonomy': 'robotics',
  '07-systems-hil-and-production': 'systems',
  '08-capstone-projects': 'capstone',
  'modules:00-foundations': 'math',
  'modules:01-electronics': 'circuits',
  'modules:02-mechanics': 'mechanics',
  'modules:03-sensors': 'sensors',
  'modules:04-embedded': 'embedded',
  'modules:05-control': 'control',
  'modules:06-robotics': 'robotics',
  'modules:07-systems': 'systems',
  'modules:08-capstones': 'capstone',
};

const THEME_BY_REGION: Record<PathRegionId, DistrictTheme> = {
  programming: 'python',
  mathematics: 'math',
  electronics: 'circuits',
  cad: 'mechanics',
  robotics: 'robotics',
};

export function districtTheme(districtKey: string, region: PathRegionId): DistrictTheme {
  return THEME_BY_DISTRICT[districtKey] ?? THEME_BY_REGION[region];
}

export const DistrictScenery: React.FC<{ theme: DistrictTheme; variant: number }> = ({
  theme,
  variant,
}) => (
  <div className="lp-district-scenery" data-theme={theme} data-variant={variant % 4} aria-hidden="true">
    <span className="lp-scene-haze" />
    <span className="lp-scene lp-scene-a">
      <SceneIcon theme={theme} mirror={false} />
    </span>
    <span className="lp-scene lp-scene-b">
      <SceneIcon theme={theme} mirror />
    </span>
    <span className="lp-tree lp-tree-a" />
    <span className="lp-tree lp-tree-b" />
    <span className="lp-tree lp-tree-c" />
    <span className="lp-flower-bed lp-flower-bed-a" />
    <span className="lp-flower-bed lp-flower-bed-b" />
    {(variant % 4 === 1 || variant % 4 === 3) && <span className="lp-pond" />}
    {(variant % 4 === 1 || variant % 4 === 3) && <span className="lp-footbridge" />}
    <span className="lp-bench" />
    <span className="lp-lamp" />
  </div>
);

/**
 * One theme's signature structure. They are silhouettes on purpose: the middle ground should give
 * each district a skyline, not compete with the detailed landmarks in front of it.
 */
function SceneIcon({ theme, mirror }: { theme: DistrictTheme; mirror: boolean }) {
  const transform = mirror ? 'translate(160 0) scale(-1 1)' : undefined;
  return (
    <svg viewBox="0 0 160 160" role="presentation" focusable="false">
      <g transform={transform}>
        {theme === 'python' && (
          <>
            <rect x="28" y="68" width="48" height="78" rx="5" />
            <rect x="82" y="88" width="38" height="58" rx="4" />
            <rect x="42" y="46" width="28" height="26" rx="4" />
            <path d="M56 46V30M56 30h20" />
            <g className="lp-scene-cutouts">
              <rect x="38" y="82" width="8" height="7" />
              <rect x="52" y="82" width="8" height="7" />
              <rect x="38" y="96" width="8" height="7" />
              <rect x="52" y="96" width="8" height="7" />
              <rect x="90" y="102" width="7" height="6" />
              <rect x="103" y="102" width="7" height="6" />
            </g>
          </>
        )}
        {theme === 'math' && (
          <>
            <rect x="30" y="116" width="104" height="30" rx="5" />
            <path d="M48 116a34 34 0 0 1 68 0z" />
            <path d="M66 116a16 16 0 0 1 32 0" className="lp-scene-line" />
            <circle cx="128" cy="58" r="21" className="lp-scene-line" />
            <path d="M128 37v42M107 58h42M113 43l30 30M143 43l-30 30" className="lp-scene-line" />
          </>
        )}
        {theme === 'circuits' && (
          <>
            <rect x="26" y="112" width="45" height="34" rx="4" />
            <rect x="78" y="101" width="52" height="45" rx="4" />
            <path d="M39 112V82h12v30M94 101V74h20v27" className="lp-scene-line" />
            <path d="M42 70h34M58 52v36M58 52h24" className="lp-scene-line" />
            <circle cx="84" cy="52" r="4" />
            <path d="M118 101V66M132 101V79M118 66h14" className="lp-scene-line" />
            <g className="lp-scene-cutouts">
              <rect x="88" y="114" width="10" height="8" />
              <rect x="106" y="114" width="10" height="8" />
            </g>
          </>
        )}
        {theme === 'mechanics' && (
          <>
            <path d="M26 146V62h12v84M122 146V62h12v84M20 62h120v10H20z" />
            <path d="M72 72v38M94 72v38M60 110h44v8H60z" className="lp-scene-line" />
            <rect x="48" y="118" width="64" height="28" rx="3" />
            <circle cx="64" cy="146" r="7" />
            <circle cx="96" cy="146" r="7" />
            <path d="M80 72V52M80 52h38" className="lp-scene-line" />
          </>
        )}
        {theme === 'robotics' && (
          <>
            <rect x="24" y="122" width="112" height="24" rx="5" />
            <path d="M46 122a34 34 0 0 1 68 0z" />
            <path d="M64 122a16 16 0 0 1 32 0" className="lp-scene-line" />
            <rect x="110" y="94" width="25" height="28" rx="4" />
            <path d="M118 94V75h18l8-13" className="lp-scene-line" />
            <circle cx="146" cy="60" r="5" />
            <path d="M18 132h14M126 132h14" className="lp-scene-line" />
          </>
        )}
        {theme === 'embedded' && (
          <>
            <rect x="42" y="58" width="58" height="88" rx="5" />
            <rect x="104" y="90" width="30" height="56" rx="4" />
            <path d="M56 76h30M56 92h30M56 108h20M70 58V38M70 38h20" className="lp-scene-line" />
            <circle cx="118" cy="76" r="13" className="lp-scene-line" />
            <path d="M118 63v26M105 76h26" className="lp-scene-line" />
            <g className="lp-scene-cutouts">
              <rect x="52" y="124" width="7" height="7" />
              <rect x="64" y="124" width="7" height="7" />
            </g>
          </>
        )}
        {theme === 'sensors' && (
          <>
            <path d="M82 146V44M58 146l24-102 24 102M58 146h48M68 106h28M74 76h16" />
            <rect x="70" y="34" width="24" height="8" rx="2" />
            <ellipse cx="82" cy="30" rx="24" ry="8" className="lp-scene-line" />
            <path d="M110 20c14 13 15 33 3 47M120 10c20 19 21 48 4 68" className="lp-scene-line" />
            <rect x="34" y="126" width="24" height="20" rx="3" />
            <circle cx="46" cy="112" r="5" />
          </>
        )}
        {theme === 'control' && (
          <>
            <rect x="30" y="112" width="52" height="34" rx="5" />
            <path d="M46 112a22 22 0 0 1 44 0z" />
            <rect x="96" y="70" width="30" height="76" rx="5" />
            <rect x="100" y="58" width="22" height="12" rx="4" />
            <path d="M111 58V38M111 38h18" />
            <circle cx="128" cy="34" r="4" />
            <path d="M38 124h34M46 136h26" className="lp-scene-line" />
            <circle cx="126" cy="92" r="7" className="lp-scene-line" />
          </>
        )}
        {theme === 'systems' && (
          <>
            <rect x="24" y="102" width="52" height="44" rx="4" />
            <rect x="88" y="88" width="44" height="58" rx="4" />
            <path d="M76 114h12M76 130h12M50 88V64M108 88V60" className="lp-scene-line" />
            <path d="M42 64h84v10H42zM64 64V50h40v14" />
            <path d="M34 114h30M98 102h24M98 118h24" className="lp-scene-line" />
            <circle cx="132" cy="60" r="9" className="lp-scene-line" />
          </>
        )}
        {theme === 'capstone' && (
          <>
            <rect x="26" y="124" width="108" height="22" rx="4" />
            <rect x="40" y="94" width="34" height="30" rx="3" />
            <rect x="84" y="94" width="34" height="30" rx="3" />
            <path d="M72 94V58l8-18 8 18v36" />
            <path d="M64 124V76h8v48M88 124V76h8v48" className="lp-scene-line" />
            <circle cx="80" cy="34" r="5" />
            <path d="M60 76h40" className="lp-scene-line" />
          </>
        )}
      </g>
    </svg>
  );
}

export const WorldGround: React.FC = () => (
  <svg
    className="lp-world-ground"
    width="100%"
    height="100%"
    role="presentation"
    focusable="false"
    aria-hidden="true"
  >
    <defs>
      <pattern id="lp-ground-pattern" width="640" height="360" patternUnits="userSpaceOnUse">
        <g opacity="0.58">
          <ellipse cx="100" cy="330" rx="166" ry="36" fill="#7fbe72" />
          <ellipse cx="516" cy="318" rx="168" ry="40" fill="#b8e39b" />
          <path
            d="M0 302c78-22 140 20 216 2s124-28 194-4 126 14 230-8"
            fill="none"
            stroke="#f2dfb6"
            strokeWidth="15"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="M0 324c52 8 86-2 124-10M552 312c34 1 63 7 88 18"
            fill="none"
            stroke="#9acb80"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.75"
          />
          <g opacity="0.55" fill="#a8cfc6">
            <rect x="338" y="82" width="48" height="62" rx="5" />
            <rect x="394" y="98" width="34" height="46" rx="4" />
            <rect x="436" y="70" width="26" height="74" rx="4" />
            <path d="M362 82V64h28v18M450 70V52" fill="none" stroke="#8ebcb2" strokeWidth="3" />
            <rect x="104" y="132" width="38" height="54" rx="4" />
            <rect x="148" y="150" width="26" height="36" rx="3" />
          </g>
          <g fill="#f1faf0" opacity="0.65">
            <rect x="350" y="94" width="7" height="8" rx="1" />
            <rect x="366" y="94" width="7" height="8" rx="1" />
            <rect x="350" y="110" width="7" height="8" rx="1" />
            <rect x="404" y="108" width="7" height="7" rx="1" />
            <rect x="446" y="84" width="6" height="8" rx="1" />
            <rect x="114" y="144" width="6" height="7" rx="1" />
            <rect x="128" y="144" width="6" height="7" rx="1" />
          </g>
          <g transform="translate(300 288)">
            <path d="M-72 0c12-10 26-10 38 0M14 0c12-9 25-9 37 0" fill="none" stroke="#79cfe0" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
            <path d="M-52 0v10M-22 0v10M28 0v10M54 0v10" stroke="#fff8e8" strokeWidth="2" opacity="0.7" />
          </g>
          <ellipse cx="300" cy="318" rx="60" ry="17" fill="#79cfe0" />
          <ellipse cx="300" cy="314" rx="50" ry="11" fill="#a5e5ee" />
          <path d="M274 312h18l-5 7h-8z" fill="#fff8e8" />
          <path d="M290 312v-12l10 7z" fill="#ef836b" />
          <g transform="translate(54 248)">
            <rect x="-4" y="22" width="8" height="36" rx="3" fill="#8b6845" />
            <circle cx="0" cy="5" r="32" fill="#559d59" />
            <circle cx="-20" cy="22" r="21" fill="#6bb168" />
            <circle cx="20" cy="25" r="19" fill="#4b8d51" />
            <circle cx="-6" cy="-8" r="13" fill="#79bd6d" opacity="0.62" />
          </g>
          <g transform="translate(562 216) scale(.82)">
            <rect x="-4" y="22" width="8" height="36" rx="3" fill="#8b6845" />
            <circle cx="0" cy="5" r="32" fill="#62a95f" />
            <circle cx="-20" cy="22" r="21" fill="#78bc6d" />
            <circle cx="20" cy="25" r="19" fill="#4f9454" />
          </g>
          <g transform="translate(476 252) scale(.9)">
            <rect x="-3" y="16" width="6" height="26" rx="2" fill="#8b6845" />
            <circle cx="0" cy="4" r="20" fill="#6db46a" />
            <circle cx="-12" cy="14" r="13" fill="#84c779" />
          </g>
          <g fill="#f7d36b">
            <circle cx="154" cy="308" r="4" />
            <circle cx="168" cy="318" r="3" />
            <circle cx="142" cy="321" r="3" />
            <circle cx="438" cy="302" r="3.5" />
            <circle cx="452" cy="313" r="3" />
            <circle cx="226" cy="334" r="3" />
          </g>
          <g transform="translate(232 306)">
            <rect x="0" y="0" width="14" height="5" rx="2" fill="#e07c63" />
            <circle cx="3" cy="6" r="2" fill="#385e51" />
            <circle cx="11" cy="6" r="2" fill="#385e51" />
          </g>
        </g>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#lp-ground-pattern)" />
  </svg>
);

/** The painted horizon: mountains, two skyline layers, a distant river and its bridge. */
export const SkyScenery: React.FC = () => (
  <div className="lp-sky" aria-hidden="true">
    <svg viewBox="0 0 1440 480" preserveAspectRatio="xMidYMax slice">
      <circle cx="1218" cy="88" r="56" fill="#ffd66b" opacity="0.96" />
      <circle cx="1218" cy="88" r="76" fill="#ffd66b" opacity="0.2" />
      <circle cx="1218" cy="88" r="104" fill="#ffd66b" opacity="0.08" />
      <g fill="#ffffff" opacity="0.9">
        <ellipse cx="238" cy="92" rx="76" ry="24" />
        <ellipse cx="288" cy="78" rx="48" ry="21" />
        <ellipse cx="192" cy="82" rx="42" ry="17" />
        <ellipse cx="806" cy="60" rx="56" ry="18" />
        <ellipse cx="848" cy="50" rx="34" ry="15" />
        <ellipse cx="1050" cy="116" rx="49" ry="15" opacity="0.7" />
        <ellipse cx="1086" cy="108" rx="30" ry="12" opacity="0.7" />
      </g>
      <path d="M0 278l118-106 84 74 92-88 86 96 96-64 88 72 108-96 112 102 82-58 90 86 108-72 96 78 90-58v154H0z" fill="#c6e5d8" opacity="0.82" />
      <path d="M0 306l112-66 82 46 92-36 88 58 102-32 88 50 94-40 104 52 92-28 98 48 102-36 92 44 94-24v96H0z" fill="#b1dccb" opacity="0.8" />
      <path d="M126 274l44-34 26 22 24-18 28 30zM704 268l42-36 32 28 28-20 46 30zM1200 262l36-28 30 24 22-16 34 22z" fill="#eefaf4" opacity="0.8" />
      <path d="M0 348c134-60 260-46 382 4s226 28 346-18 238-42 354 4 210 28 358-6v148H0z" fill="#a8dda1" />
      <path d="M0 380c150-42 258-18 376 18s228 20 348-24 240-36 360 10 208 24 356-12v108H0z" fill="#8fce80" />
      <path d="M0 410c152-24 264-4 386 18s236 8 358-18 240-20 360 12 194 12 336-4v62H0z" fill="#78bf71" />
      <g fill="#8ebfb5" opacity="0.72">
        <rect x="58" y="294" width="60" height="112" rx="7" />
        <rect x="128" y="322" width="78" height="84" rx="7" />
        <rect x="216" y="272" width="46" height="134" rx="6" />
        <rect x="272" y="306" width="88" height="100" rx="8" />
        <rect x="1006" y="286" width="52" height="120" rx="7" />
        <rect x="1068" y="312" width="88" height="94" rx="7" />
        <rect x="1168" y="258" width="44" height="148" rx="6" />
        <rect x="1222" y="298" width="100" height="108" rx="8" />
        <rect x="438" y="326" width="58" height="80" rx="6" opacity="0.55" />
        <rect x="506" y="342" width="40" height="64" rx="5" opacity="0.5" />
      </g>
      <g fill="#eaf7ee" opacity="0.72">
        <rect x="70" y="310" width="10" height="13" rx="2" />
        <rect x="92" y="310" width="10" height="13" rx="2" />
        <rect x="144" y="338" width="10" height="11" rx="2" />
        <rect x="166" y="338" width="10" height="11" rx="2" />
        <rect x="230" y="292" width="9" height="14" rx="2" />
        <rect x="290" y="324" width="10" height="11" rx="2" />
        <rect x="314" y="324" width="10" height="11" rx="2" />
        <rect x="1020" y="304" width="9" height="13" rx="2" />
        <rect x="1084" y="330" width="10" height="11" rx="2" />
        <rect x="1182" y="276" width="9" height="15" rx="2" />
        <rect x="1244" y="316" width="10" height="11" rx="2" />
      </g>
      <g className="lp-sky-cranes" fill="none" stroke="#7caaa0" strokeWidth="3" opacity="0.65">
        <path d="M358 276V220h44M358 234h-16M402 220l-14 18M562 304V262h32" />
        <path d="M1324 272V222h-42M1324 236h15M1282 222l13 16" />
      </g>
      <path
        d="M846 362c38-16 78-12 118 6s80 20 122 0"
        fill="none"
        stroke="#7acddd"
        strokeWidth="16"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d="M846 358c38-16 78-12 118 6s80 20 122 0"
        fill="none"
        stroke="#b8f0f5"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.8"
      />
      <g className="lp-sky-bridge" fill="none" stroke="#f6ecda" strokeWidth="4">
        <path d="M930 366c12-18 34-18 46 0M930 366v14M976 366v14M938 369v11M968 369v11" />
      </g>
      <g transform="translate(394 318)">
        <rect x="-5" y="18" width="10" height="46" rx="4" fill="#8b6845" />
        <circle cx="0" cy="0" r="40" fill="#5fa45f" />
        <circle cx="-25" cy="19" r="26" fill="#74b86a" />
        <circle cx="25" cy="21" r="24" fill="#4c9152" />
        <circle cx="-8" cy="-18" r="16" fill="#90c97c" opacity="0.7" />
      </g>
      <g transform="translate(954 320) scale(.8)">
        <rect x="-5" y="18" width="10" height="46" rx="4" fill="#8b6845" />
        <circle cx="0" cy="0" r="40" fill="#6cb267" />
        <circle cx="-25" cy="19" r="26" fill="#83c476" />
      </g>
      <g stroke="#5f8f83" strokeWidth="2" fill="none" opacity="0.6">
        <path d="M644 120c6-5 12-5 18 0M674 108c5-4 10-4 15 0" />
        <path d="M1122 146c5-4 10-4 15 0" />
      </g>
    </svg>
  </div>
);

/**
 * The middle ground's water: a winding canal down the world's right edge with three footbridges.
 * It is one path rather than scenery per band, so it reads as a continuous piece of the city.
 */
export const WorldCanal: React.FC = () => (
  <div className="lp-canal" aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
      <path
        className="lp-canal-bank"
        d="M97 0c-5 12 2 24-3 36s2 25-2 38 1 18-2 26"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="lp-canal-water"
        d="M97 0c-5 12 2 24-3 36s2 25-2 38 1 18-2 26"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="lp-canal-shine"
        d="M97 0c-5 12 2 24-3 36s2 25-2 38 1 18-2 26"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
    <span className="lp-bridge lp-bridge-a" />
    <span className="lp-bridge lp-bridge-b" />
    <span className="lp-bridge lp-bridge-c" />
  </div>
);
