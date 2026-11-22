/**
 * Block appearance (`app/src/pythonBlocks/appearance.ts`).
 *
 * Two looks, one program. **Normal** is the default: neutral ink and surface, with the kind's colour
 * kept to the card's left rule, so the Python is what stands out but a loop and a condition are still
 * one glance apart. **Colorful** gives every statement kind its own semantic ink, mixed from the
 * theme's tokens, so a learner can tell a `while` from a `try` across the workspace.
 *
 * The colours are `var()` references and `color-mix()` expressions rather than hex values, which is
 * what makes both looks work in dark, light, paper and high-contrast without a second table: the
 * palette already decided what "emerald" means there. Appearance never reaches the model, the
 * generated code or a check — it is only how a card is drawn.
 */

import type { BlockKind } from './ast.ts';

export type BlockAppearance = 'normal' | 'colorful';

export const APPEARANCE_LABELS: Record<BlockAppearance, string> = {
  normal: 'Normal',
  colorful: 'Colorful',
};

/**
 * The semantic ink a statement kind uses.
 *
 * A family shares a base token — the `if`/`elif`/`else`/`return` group is amber, loops are rose,
 * definitions and handlers are purple — and the neighbouring kinds are pulled toward the next family
 * with `color-mix`, so every one of the fourteen kinds has its own readable shade without inventing
 * a fifteenth palette. The mix is in the token space, so it follows all four palettes.
 */
const KIND_INK: Record<BlockKind, string> = {
  assign: 'var(--accent)',
  call: 'var(--emerald)',
  if: 'var(--amber)',
  elif: 'color-mix(in srgb, var(--amber) 55%, var(--rose))',
  else: 'color-mix(in srgb, var(--amber) 52%, var(--purple))',
  return: 'color-mix(in srgb, var(--amber) 55%, var(--accent))',
  for: 'var(--rose)',
  while: 'color-mix(in srgb, var(--rose) 55%, var(--purple))',
  def: 'var(--purple)',
  try: 'color-mix(in srgb, var(--purple) 55%, var(--accent))',
  except: 'color-mix(in srgb, var(--purple) 45%, var(--rose))',
  finally: 'color-mix(in srgb, var(--purple) 45%, var(--emerald))',
  import: 'color-mix(in srgb, var(--muted) 55%, var(--accent))',
  raw: 'var(--muted)',
};

interface BlockColors {
  /** The statement's keyword/token colour. `var(--body)` in Normal, the kind's ink in Colorful. */
  ink: string;
  /** The card's working surface. */
  background: string;
  /** The card's edge; a little stronger in Colorful because the ink is doing more work. */
  border: string;
  /** The surface an inline field sits on. */
  field: string;
  /** The card's left rule, the one place the kind reads at a glance. */
  rule: string;
}

/**
 * The four colours one card needs.
 *
 * Colorful mixes the kind's ink into the panel at a low percentage, so the wash follows the palette
 * (a dark wash on dark, a pale one on paper) instead of being a fixed pastel that vanishes in one
 * theme and glares in another.
 */
export function blockColors(kind: BlockKind, appearance: BlockAppearance): BlockColors {
  const ink = KIND_INK[kind];
  if (appearance === 'normal') {
    return {
      ink: 'var(--body)',
      background: 'var(--panel)',
      border: 'var(--border-soft)',
      field: 'var(--bg)',
      // The rule is the one place the kind reads at a glance. Normal keeps the text neutral and
      // softens the ink into the theme's border, so the families are distinguishable without the
      // surface becoming a colour chart.
      rule: `color-mix(in srgb, ${ink} 62%, var(--border-strong))`,
    };
  }
  return {
    ink,
    background: `color-mix(in srgb, ${ink} 8%, var(--panel))`,
    border: `color-mix(in srgb, ${ink} 34%, var(--border-soft))`,
    field: `color-mix(in srgb, ${ink} 6%, var(--bg))`,
    rule: ink,
  };
}
