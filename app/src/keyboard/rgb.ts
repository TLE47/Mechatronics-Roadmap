/**
 * The keyboard lighting's settings (`app/src/keyboard/rgb.ts`).
 *
 * The RGB panel is a layer of the one phone keyboard, not a second surface, so what it remembers is
 * one small record beside the other device-local editor preferences: the mode, the colour, and how
 * bright and how fast the effect runs. Nothing here draws anything — `MobilePythonKeyboard.tsx`
 * turns these values into CSS custom properties and `index.css` owns the animation — so a mode can
 * be persisted before the keyboard has ever painted.
 *
 * `normalizeRgbSettings` is the single door stored values come through, the same shape as
 * `pythonBlocks/settings.ts`: a half-written record from an older build reads as a complete,
 * drawable choice rather than as a throw or as a mode the CSS cannot draw.
 */

export type RgbMode = 'off' | 'static' | 'cycle' | 'breathing' | 'rainbow' | 'reactive';

export interface RgbSettings {
  mode: RgbMode;
  /** A six-digit hex colour, lowercase. */
  color: string;
  /** 5–100: a mode that is on never makes the caps unreadable. */
  brightness: number;
  /** 0–100; the effect's duration is derived from it in the component. */
  speed: number;
}

/** The six modes the panel offers, in the order it draws them. Labels fit a 390 px row. */
export const RGB_MODES: readonly { id: RgbMode; label: string; name: string }[] = [
  { id: 'off', label: 'Off', name: 'Keyboard lighting off' },
  { id: 'static', label: 'Static', name: 'One colour on every key' },
  { id: 'cycle', label: 'Cycle', name: 'Cycle smoothly through the spectrum' },
  { id: 'breathing', label: 'Breathe', name: 'Fade the chosen colour in and out' },
  { id: 'rainbow', label: 'Rainbow', name: 'A rainbow moving across the keys' },
  { id: 'reactive', label: 'React', name: 'Light a key while it is pressed' },
];

/** Six presets, spread around the spectrum and legible against both themes' keycaps. */
export const RGB_PRESETS: readonly string[] = [
  '#5eead4',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#c084fc',
  '#60a5fa',
];

export const RGB_DEFAULTS: RgbSettings = {
  mode: 'off',
  color: '#5eead4',
  brightness: 60,
  speed: 50,
};

const RGB_SETTINGS_KEY = 'mechalab_keyboard_rgb_v1';
const HEX = /^#[0-9a-f]{6}$/i;
const MODES: readonly RgbMode[] = ['off', 'static', 'cycle', 'breathing', 'rainbow', 'reactive'];

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function percent(value: unknown, fallback: number, floor: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(floor, Math.min(100, Math.round(value)))
    : fallback;
}

/** A complete, drawable value from anything that was stored. */
export function normalizeRgbSettings(value: unknown): RgbSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    mode: MODES.includes(record.mode as RgbMode) ? (record.mode as RgbMode) : RGB_DEFAULTS.mode,
    color:
      typeof record.color === 'string' && HEX.test(record.color)
        ? record.color.toLowerCase()
        : RGB_DEFAULTS.color,
    brightness: percent(record.brightness, RGB_DEFAULTS.brightness, 5),
    speed: percent(record.speed, RGB_DEFAULTS.speed, 0),
  };
}

export function readRgbSettings(): RgbSettings {
  try {
    const raw = store()?.getItem(RGB_SETTINGS_KEY);
    if (!raw || raw.trim() === '') return normalizeRgbSettings(null);
    return normalizeRgbSettings(JSON.parse(raw));
  } catch {
    return normalizeRgbSettings(null);
  }
}

/**
 * Write the lighting preferences, merging into what is stored.
 *
 * A patch rather than a whole value for the same reason the block settings are: one control must
 * not erase another's choice, and a blocked store costs the memory, never the switch.
 */
export function writeRgbSettings(patch: Partial<RgbSettings>): RgbSettings {
  const next = normalizeRgbSettings({ ...readRgbSettings(), ...patch });
  try {
    store()?.setItem(RGB_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Blocked or full: the choice lasts this visit.
  }
  return next;
}
