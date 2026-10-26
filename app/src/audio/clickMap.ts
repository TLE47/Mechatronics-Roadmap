/**
 * What a control *is*, from what it says about itself (`app/src/audio/clickMap.ts`).
 *
 * The workbench has a few hundred buttons, and giving each one a line of sound code would be a
 * second styling system nobody keeps current. So the map is two layers:
 *
 * 1. **Explicit.** `data-sound="nav"` on the controls whose category matters (the tab rail, Run,
 *    the palette's rows). That attribute is the answer, always.
 * 2. **Derived.** Otherwise the element's own semantics decide: a `role="tab"` is navigation, an
 *    `input[type=range]` is a slider, an `aria-pressed` or `aria-expanded` control is a toggle, and
 *    a plain button is the primary action it looks like. Text fields get nothing — typing is not a
 *    sound in this design — and a disabled control is silent, because it did not do anything.
 *
 * This module is pure: it takes a description, not an element, so the rules can be pinned in Node
 * without a DOM. `SoundClicks.tsx` is the only thing that reads real elements.
 */
import { isUiRole, type UiRole } from './facade.ts';

/** What the classifier needs to know about one control. Everything else is noise. */
export interface ControlFacts {
  /** Lower-case tag name: `button`, `a`, `summary`, `label`, `select`, `input`. */
  tag: string;
  role?: string | null;
  /** `input`'s `type` attribute; ignored for every other tag. */
  inputType?: string | null;
  /** `data-sound`, the explicit answer. */
  sound?: string | null;
  disabled?: boolean;
  ariaDisabled?: boolean;
  /** `null` when the attribute is absent, which is not the same as `"false"`. */
  ariaExpanded?: boolean | null;
  ariaPressed?: boolean | null;
  /** `aria-label`, then `title`, then the visible text — for the close family only. */
  label?: string | null;
}

/** The selector a delegated listener watches. Deliberately not `*`: hover targets make no sound. */
export const CLICK_TARGETS = [
  'button',
  'a[href]',
  'summary',
  'label',
  'select',
  'input[type="range"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
].join(', ');

/** The words that make a button a way out rather than a way in. */
export const CLOSE_WORDS = /\b(close|dismiss|cancel|skip|reset|discard|leave|back|remove|delete)\b/i;

/** Text fields are silent: the design has no typing sound, and a focus click is not an action. */
const TEXT_INPUTS = new Set(['text', 'search', 'email', 'password', 'number', 'tel', 'url', 'date']);

/**
 * The role for one control, or `null` when it must be silent.
 *
 * Order matters: disabled and the explicit attribute come first, because a control can be both a
 * toggle and disabled, and the page's own `data-sound` must beat any guess.
 */
export function roleForControl(facts: ControlFacts): UiRole | null {
  if (facts.disabled || facts.ariaDisabled) return null;

  const declared = (facts.sound ?? '').trim();
  if (declared === 'none') return null;
  if (isUiRole(declared)) return declared;

  const tag = (facts.tag ?? '').toLowerCase();
  const role = (facts.role ?? '').toLowerCase();

  if (tag === 'input') {
    const type = (facts.inputType ?? 'text').toLowerCase();
    if (type === 'range') return 'slider';
    if (type === 'checkbox' || type === 'radio') return 'toggle';
    if (TEXT_INPUTS.has(type)) return null;
    return 'row';
  }

  if (role === 'tab') return 'nav';
  if (role === 'switch') return 'toggle';
  if (role === 'option' || role === 'menuitem') return 'row';
  if (facts.ariaPressed !== null && facts.ariaPressed !== undefined) return 'toggle';
  if (facts.ariaExpanded !== null && facts.ariaExpanded !== undefined) return 'toggle';
  if (tag === 'a' || tag === 'select') return 'nav';
  if (tag === 'summary') return 'row';
  if (tag === 'label') return 'toggle';
  if (tag === 'button' || role === 'button') {
    return CLOSE_WORDS.test(facts.label ?? '') ? 'close' : 'primary';
  }
  return null;
}

/** Pan from a pointer's x in the viewport: centre is silent-ish, the edges lean. */
export function panFromX(x: number, width: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, x / width));
  return (ratio * 2 - 1) * 0.35;
}
