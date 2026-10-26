/**
 * The room's rules, without the room (`app/src/workshop.ts`).
 *
 * The workshop is a 2.5D diorama: two depth lanes (the bench at the back, the floor at the front),
 * a figure that walks left and right, and three hotspots. None of that needs React, so the model
 * lives here and `components/game/Workshop.tsx` only draws what this file decides. That split is
 * what lets `scripts/test_workshop.mjs` pin the rules — clamping, reach, lane changes, the key map —
 * in Node, without a browser or a rendering library.
 *
 * Three promises are encoded rather than left to the component:
 *
 * 1. **The room never traps you.** `pose.x` is clamped inside `MIN_X..MAX_X`, every hotspot has a
 *    menu entry (the menu is generated from this list, not typed again), and the door's action is a
 *    plain navigation the page owns.
 * 2. **The keyboard and the pointer do the same things.** `keyAction` is the one key map, and the
 *    component's buttons call the same handlers — there is no interaction that needs a mouse.
 * 3. **Reach is a rule, not a hit box.** `activeHotspot` answers "is the figure close enough?", so a
 *    click from across the room and a press of E agree about where the learner is standing.
 */

/** The bench is the back lane; the floor is the front one, nearer the camera. */
export type Lane = 'bench' | 'floor';

export interface Pose {
  /** Normalised left-to-right position, 0..1 across the room. */
  x: number;
  lane: Lane;
}

export interface Hotspot {
  id: 'terminal' | 'h7' | 'door';
  /** The name the menu and the room both print. */
  label: string;
  /** One line saying what standing here does. */
  hint: string;
  x: number;
  lane: Lane;
}

/** How far one key press or tap walks, as a fraction of the room. */
export const STEP = 0.06;
/** How close the figure must stand to use a hotspot. */
export const REACH = 0.075;
/** The walls: the figure stays visible, with the door and H-7 still inside the room. */
export const MIN_X = 0.06;
export const MAX_X = 0.94;

/**
 * The three hotspots, in the order the menu lists them. The coordinates are the painted positions;
 * the room draws each button at its own `x`/`lane`, so a moved hotspot cannot drift from its menu
 * entry — there is one list.
 */
export const HOTSPOTS: readonly Hotspot[] = [
  {
    id: 'terminal',
    label: 'Bench terminal',
    hint: 'Continue the lesson',
    x: 0.5,
    lane: 'bench',
  },
  {
    id: 'h7',
    label: 'H-7',
    hint: 'Inspect the robot',
    x: 0.76,
    lane: 'bench',
  },
  {
    id: 'door',
    label: 'Alley door',
    hint: 'Back to the workbench',
    x: 0.12,
    lane: 'floor',
  },
];

/** Where a visit starts: on the floor, a step inside the door. */
export const START: Pose = { x: 0.58, lane: 'floor' };

export const LANE_LABEL: Record<Lane, string> = {
  bench: 'the bench lane',
  floor: 'the floor lane',
};

export function clampX(x: number): number {
  if (!Number.isFinite(x)) return MIN_X;
  return Math.min(MAX_X, Math.max(MIN_X, x));
}

/** Left and right, one step each, clamped to the walls. */
export function walk(pose: Pose, direction: -1 | 1): Pose {
  return { ...pose, x: clampX(pose.x + direction * STEP) };
}

/** Nearer the camera, or nearer the bench. */
export function stepLane(pose: Pose, lane: Lane): Pose {
  return pose.lane === lane ? pose : { ...pose, lane };
}

export type Move = 'left' | 'right' | 'bench' | 'floor';

export function applyMove(pose: Pose, move: Move): Pose {
  if (move === 'left') return walk(pose, -1);
  if (move === 'right') return walk(pose, 1);
  return stepLane(pose, move === 'bench' ? 'bench' : 'floor');
}

export type Action = Move | 'interact';

/**
 * One key, one action. Both arrows and WASD are accepted because the plan names both, and `E` is
 * the only interact key: Enter and Space already activate whichever button has focus, and taking
 * them globally would make the room's buttons unreachable by their own keys.
 */
export function keyAction(key: string): Action | null {
  switch (key) {
    case 'a':
    case 'A':
    case 'ArrowLeft':
      return 'left';
    case 'd':
    case 'D':
    case 'ArrowRight':
      return 'right';
    case 'w':
    case 'W':
    case 'ArrowUp':
      return 'bench';
    case 's':
    case 'S':
    case 'ArrowDown':
      return 'floor';
    case 'e':
    case 'E':
      return 'interact';
    default:
      return null;
  }
}

export function distanceTo(pose: Pose, hotspot: Hotspot): number {
  // A hotspot on the other lane is a step away, not a walk: the floor and the bench face each
  // other, so the lane change is the whole of the distance there.
  return Math.abs(pose.x - hotspot.x) + (pose.lane === hotspot.lane ? 0 : 0.5);
}

/** The closest hotspot, whether or not it is in reach. Used for the status line's suggestion. */
export function nearestHotspot(pose: Pose): Hotspot | null {
  let best: Hotspot | null = null;
  let bestDistance = Infinity;
  for (const hotspot of HOTSPOTS) {
    const distance = distanceTo(pose, hotspot);
    if (distance < bestDistance) {
      best = hotspot;
      bestDistance = distance;
    }
  }
  return best;
}

/** The hotspot the figure can use from here, or null. Lane and distance both count. */
export function activeHotspot(pose: Pose): Hotspot | null {
  const candidate = nearestHotspot(pose);
  if (!candidate) return null;
  if (candidate.lane !== pose.lane) return null;
  return Math.abs(pose.x - candidate.x) <= REACH ? candidate : null;
}

/**
 * Walk to a point on the floor (a tap), keeping the current lane. The room's click handler is the
 * only caller; the pointer and the keyboard end in the same clamped pose.
 */
export function walkTo(pose: Pose, x: number): Pose {
  return { ...pose, x: clampX(x) };
}

/** What the live status line says, in words a screen reader can use without the picture. */
export function describePose(pose: Pose): string {
  const nearest = nearestHotspot(pose);
  if (!nearest) return `Standing on ${LANE_LABEL[pose.lane]}.`;
  const here = activeHotspot(pose);
  if (here) return `Standing on ${LANE_LABEL[pose.lane]}, at the ${here.label}. Press E to ${here.hint.toLowerCase()}.`;
  return `Standing on ${LANE_LABEL[pose.lane]}, near the ${nearest.label}.`;
}

/** Percent, rounded for a stable `data-x` and a `style.left`. */
export function positionPercent(x: number): string {
  return `${Math.round(clampX(x) * 1000) / 10}%`;
}
