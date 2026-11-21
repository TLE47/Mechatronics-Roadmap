/**
 * Block appearance (`app/src/pythonBlocks/appearance.ts`).
 *
 * Two looks, one program. **Normal** is the default: neutral cards with subtle borders, so the
 * Python is what stands out. **Colorful** gives each statement family its own semantic ink from the
 * theme's existing tokens, so a learner can tell a loop from a condition across the workspace.
 *
 * The colours are `var()` references rather than hex values, which is what makes both looks work in
 * dark, light, paper and high-contrast without a second table: the palette already decided what
 * "emerald" means there. Appearance never reaches the model, the generated code or a check — it is
 * only how a card is drawn.
 */

import type { BlockKind } from './ast.ts';

export type BlockAppearance = 'normal' | 'colorful';

export const APPEARANCE_LABELS: Record<BlockAppearance, string> = {
  normal: 'Normal',
  colorful: 'Colorful',
};

/** The semantic ink a statement kind uses in Colorful. */
const KIND_TOKEN: Record<BlockKind, string> = {
  assign: '--accent',
  call: '--emerald',
  if: '--amber',
  elif: '--amber',
  else: '--amber',
  return: '--amber',
  for: '--rose',
  while: '--rose',
  def: '--purple',
  try: '--purple',
  except: '--purple',
  finally: '--purple',
  import: '--muted',
  raw: '--muted',
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
  if (appearance === 'normal') {
    return {
      ink: 'var(--body)',
      background: 'var(--panel)',
      border: 'var(--border-soft)',
      field: 'var(--bg)',
      rule: 'var(--border-strong)',
    };
  }
  const token = KIND_TOKEN[kind];
  return {
    ink: `var(${token})`,
    background: `color-mix(in srgb, var(${token}) 8%, var(--panel))`,
    border: `color-mix(in srgb, var(${token}) 34%, var(--border-soft))`,
    field: `color-mix(in srgb, var(${token}) 6%, var(--bg))`,
    rule: `var(${token})`,
  };
}
