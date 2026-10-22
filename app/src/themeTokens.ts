/**
 * The palette as data: `app/src/index.css` read back into the rows the theme route prints.
 *
 * The route must not carry a second copy of the palette — a hand-typed table is a table that one day
 * says something the stylesheet does not. So the stylesheet is the input (`index.css?raw` in the
 * page, a file read in the Node suite) and this module is the only thing that knows its shape.
 *
 * Five blocks matter, and all five are read rather than assumed:
 *
 *   :root                    the dark palette, and the value every token starts at
 *   [data-theme="light"]     the tokens the light palette re-points
 *   [data-theme="paper"]     the tokens the paper palette re-points
 *   [data-theme="contrast"]  the tokens high contrast re-points
 *   @theme inline            `--color-<family>: var(--token)`, i.e. which utility reaches which token
 *
 * A token is a *colour* when its own value is one (`#0e1624`, `rgba(...)`). Everything else — radii,
 * shadows, the type steps, spacing, motion — is a scale value: worth printing, never worth a swatch.
 * `--shadow-sm` starts with a length and `--ring` with a shadow, so neither is mistaken for a colour.
 */

export interface TokenRow {
  /** The custom property, `--panel-2`. */
  name: string;
  /** Its dark value, exactly as the stylesheet writes it. */
  dark: string;
  /** Its light value: the override where there is one, else the dark value it keeps. */
  light: string;
  /** False when the light palette deliberately leaves the token alone (the plot face). */
  themed: boolean;
  /** Its paper value: the override where there is one, else the dark value it keeps. */
  paper: string;
  /** False when the paper palette leaves the token alone (the plot face, and the whole type scale). */
  themedPaper: boolean;
  /** Its high-contrast value: the override where there is one, else the dark value it keeps. */
  contrast: string;
  /** False when high contrast leaves the token alone (the plot face, and the whole type scale). */
  themedContrast: boolean;
}

export interface ColourToken extends TokenRow {
  /** The `@theme inline` family that reaches it (`raise` for `--panel-2`), or null. */
  utility: string | null;
}

export interface PaletteTable {
  colour: ColourToken[];
  scale: TokenRow[];
  /** `--color-raise` -> `--panel-2`. */
  utilities: Record<string, string>;
  /** Set when the stylesheet no longer has the blocks this page reads. */
  error: string | null;
}

const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;
const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$/;
const UTILITY = /^--color-([\w-]+)$/;

/**
 * The stylesheet without its comments. `index.css` explains itself in prose that names the very blocks
 * this module looks for (`@theme inline` appears in the header comment), so a search over the raw text
 * finds the explanation instead of the block.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** The body of the first `<opener> { ... }` block, brace-matched, or null when it is gone. */
function blockBody(source: string, opener: RegExp): string | null {
  const match = opener.exec(source);
  if (!match) return null;
  const open = source.indexOf('{', match.index);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

/** Source order, which is also the order the stylesheet groups them in (surfaces, lines, ink, …). */
function declarations(body: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DECLARATION.exec(body))) {
    out.push({ name: match[1], value: match[2].trim() });
  }
  return out;
}

function isColour(value: string): boolean {
  return COLOUR.test(value);
}

export function themeTokensFromCss(css: string): PaletteTable {
  const source = withoutComments(css);
  const darkBody = blockBody(source, /^:root\s*\{/m);
  const lightBody = blockBody(source, /^\[data-theme="light"\]\s*\{/m);
  const paperBody = blockBody(source, /^\[data-theme="paper"\]\s*\{/m);
  const contrastBody = blockBody(source, /^\[data-theme="contrast"\]\s*\{/m);
  const themeBody = blockBody(source, /^@theme inline\s*\{/m);
  if (!darkBody || !lightBody || !paperBody || !contrastBody || !themeBody) {
    const missing = [
      darkBody ? null : ':root',
      lightBody ? null : '[data-theme="light"]',
      paperBody ? null : '[data-theme="paper"]',
      contrastBody ? null : '[data-theme="contrast"]',
      themeBody ? null : '@theme inline',
    ].filter(Boolean);
    return {
      colour: [],
      scale: [],
      utilities: {},
      error: `index.css no longer has ${missing.join(', ')} — the token table has nothing to read`,
    };
  }

  const utilities: Record<string, string> = {};
  for (const { name, value } of declarations(themeBody)) {
    const family = UTILITY.exec(name);
    const target = /^var\((--[\w-]+)\)$/.exec(value);
    if (family && target) utilities[name] = target[1];
  }
  const familyFor = new Map<string, string>();
  for (const [utility, token] of Object.entries(utilities)) {
    familyFor.set(token, utility.replace('--color-', ''));
  }

  const light = new Map(declarations(lightBody).map(({ name, value }) => [name, value]));
  const paper = new Map(declarations(paperBody).map(({ name, value }) => [name, value]));
  const contrast = new Map(declarations(contrastBody).map(({ name, value }) => [name, value]));
  const colour: ColourToken[] = [];
  const scale: TokenRow[] = [];
  for (const { name, value } of declarations(darkBody)) {
    const row: TokenRow = {
      name,
      dark: value,
      light: light.get(name) ?? value,
      themed: light.has(name),
      paper: paper.get(name) ?? value,
      themedPaper: paper.has(name),
      contrast: contrast.get(name) ?? value,
      themedContrast: contrast.has(name),
    };
    if (isColour(value)) colour.push({ ...row, utility: familyFor.get(name) ?? null });
    else scale.push(row);
  }

  return { colour, scale, utilities, error: null };
}

/** Whitespace-free, lower-case form, for comparing a value from the stylesheet with one from a browser. */
export function normaliseValue(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}
