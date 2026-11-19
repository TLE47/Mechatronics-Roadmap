/**
 * The calculator's typesetting pass (`app/src/calculatorTypeset.ts`).
 *
 * A calculator that answers `1/3` with a linear slash is showing its source, not the fraction. This
 * module walks the AST `calculator.ts` already parsed and writes the same expression as TeX, so the
 * display can stack fractions, roots and powers the way the paper would. It is a serializer, not a
 * second grammar: anything the calculator refuses has no typeset form either, and the caller falls
 * back to the raw text.
 *
 * TeX is only produced here; `MathView` is the one renderer, so the calculator's math looks like the
 * formulas already in the lessons. The coverage is deliberately the whole scientific set:
 *
 *   fractions · powers · roots (square, cube, any degree) · absolute value · floor · ceiling
 *   factorial · percent · scientific notation · implicit multiplication · unary minus
 *   sin/cos/tan/sec/csc/cot · inverse and hyperbolic trigonometry · ln/log/log2/arbitrary base
 *   min/max · mod · gcd/lcm · nCr/nPr · sign/round/trunc · π, τ, φ and e
 *
 * `TYPESET_SHOWCASE` is the same list as data, rendered by the new-learner guide and asserted by
 * `scripts/test_calculator.mjs`, so a new keypad function cannot quietly go unrendered.
 */

import { parseExpression, type Node } from './calculator.ts';

const FUNCTIONS: Record<string, string> = {
  sin: '\\sin',
  cos: '\\cos',
  tan: '\\tan',
  sec: '\\sec',
  csc: '\\csc',
  cot: '\\cot',
  asin: '\\arcsin',
  acos: '\\arccos',
  atan: '\\arctan',
  sinh: '\\sinh',
  cosh: '\\cosh',
  tanh: '\\tanh',
  asinh: '\\operatorname{asinh}',
  acosh: '\\operatorname{acosh}',
  atanh: '\\operatorname{atanh}',
  ln: '\\ln',
  log: '\\log',
  exp: '\\exp',
  min: '\\min',
  max: '\\max',
  gcd: '\\gcd',
  lcm: '\\operatorname{lcm}',
  sign: '\\operatorname{sign}',
  round: '\\operatorname{round}',
  trunc: '\\operatorname{trunc}',
};

const CONSTANTS: Record<string, string> = {
  pi: '\\pi',
  'π': '\\pi',
  tau: '\\tau',
  'τ': '\\tau',
  phi: '\\varphi',
  'φ': '\\varphi',
  e: 'e',
};

/** Greek spellings a learner may type as variable names; the keypad writes the glyphs. */
const GREEK: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\epsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  iota: '\\iota',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  rho: '\\rho',
  sigma: '\\sigma',
  upsilon: '\\upsilon',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
};

function escapeTex(name: string): string {
  return name.replace(/[_{}%$#&^~\\]/g, (character) => `\\${character}`);
}

/**
 * A name as math, not as code. `x` stays italic; `L1` reads as `L₁`, `Kp` stays upright, and an
 * underscored name keeps its subscript. Multi-letter identifiers are what the grapher calls
 * parameters, so they must look like one symbol rather than five multiplied letters.
 */
function texName(name: string): string {
  const greek = GREEK[name];
  if (greek) return greek;
  const subscript = /^([A-Za-z])(?:_?([0-9]+))$/.exec(name);
  if (subscript) return `${subscript[1]}_{${subscript[2]}}`;
  const underscored = /^(.+?)_(.+)$/.exec(name);
  if (underscored) {
    return `\\mathrm{${escapeTex(underscored[1])}}_{\\mathrm{${escapeTex(underscored[2])}}}`;
  }
  return name.length === 1 ? escapeTex(name) : `\\mathrm{${escapeTex(name)}}`;
}

function texNumber(value: number): string {
  const text = String(value);
  const scientific = /^(\d+(?:\.\d+)?)e([+-]?\d+)$/.exec(text);
  if (!scientific) return text;
  return `${scientific[1]} \\times 10^{${Number(scientific[2])}}`;
}

function isAddition(node: Node): boolean {
  return node.type === 'binary' && (node.operator === '+' || node.operator === '-');
}

/** A postfix operator needs parentheses around a sum, but never around a number or a call. */
function needsPostfixGrouping(node: Node): boolean {
  return node.type === 'binary' || node.type === 'negate';
}

function parenthesize(tex: string, needed: boolean): string {
  return needed ? `\\left(${tex}\\right)` : tex;
}

function texCall(node: Extract<Node, { type: 'call' }>): string {
  const args = node.args.map((argument) => texNode(argument));
  const first = args[0] ?? '';
  const second = args[1] ?? '';
  switch (node.name) {
    case 'sqrt':
      return `\\sqrt{${first}}`;
    case 'cbrt':
      return `\\sqrt[3]{${first}}`;
    case 'nthroot':
      return `\\sqrt[${first}]{${second}}`;
    case 'abs':
      return `\\left|${first}\\right|`;
    case 'floor':
      return `\\left\\lfloor ${first} \\right\\rfloor`;
    case 'ceil':
      return `\\left\\lceil ${first} \\right\\rceil`;
    case 'log2':
      return `\\log_{2}\\left(${first}\\right)`;
    case 'logb':
      return `\\log_{${first}}\\left(${second}\\right)`;
    case 'atan2':
      return `\\operatorname{atan2}\\left(${args.join(',\\ ')}\\right)`;
    case 'mod':
      return `\\operatorname{mod}\\left(${args.join(',\\ ')}\\right)`;
    case 'ncr':
      return `\\binom{${first}}{${second}}`;
    case 'npr':
      return `{}_{${first}}P_{${second}}`;
    default: {
      const name = FUNCTIONS[node.name] ?? `\\operatorname{${node.name}}`;
      return `${name}\\left(${args.join(',\\ ')}\\right)`;
    }
  }
}

function texNode(node: Node): string {
  switch (node.type) {
    case 'number':
      return texNumber(node.value);
    case 'constant':
      return CONSTANTS[node.name] ?? texName(node.name);
    case 'variable':
      return texName(node.name);
    case 'answer':
      return '\\mathrm{Ans}';
    case 'negate':
      return `-${parenthesize(texNode(node.operand), isAddition(node.operand))}`;
    case 'call':
      return texCall(node);
    case 'factorial':
      return `${parenthesize(texNode(node.operand), needsPostfixGrouping(node.operand))}!`;
    case 'percent':
      return `${parenthesize(texNode(node.operand), needsPostfixGrouping(node.operand))}\\%`;
    case 'binary': {
      if (node.operator === '/') {
        // The fraction bar is its own grouping: `(2+1)/(2-1)` needs no extra parentheses.
        return `\\frac{${texNode(node.left)}}{${texNode(node.right)}}`;
      }
      if (node.operator === '^') {
        const needsParens =
          node.left.type === 'binary' || node.left.type === 'negate' || node.left.type === 'call';
        return `${parenthesize(texNode(node.left), needsParens)}^{${texNode(node.right)}}`;
      }
      if (node.operator === '+' || node.operator === '-') {
        const right = parenthesize(texNode(node.right), node.operator === '-' && isAddition(node.right));
        return `${texNode(node.left)} ${node.operator} ${right}`;
      }
      const leftTex = parenthesize(texNode(node.left), isAddition(node.left));
      const rightTex = parenthesize(texNode(node.right), isAddition(node.right));
      // Multiplication is juxtaposition on paper (`2x`, `(x+1)(x-1)`, `2sin(x)`); only two plain
      // numbers keep the dot a learner typed. The thin space keeps `\\pi` and `e` from merging into
      // an unknown command like `\\pie`.
      const bothNumbers = node.left.type === 'number' && node.right.type === 'number';
      return bothNumbers ? `${leftTex} \\cdot ${rightTex}` : `${leftTex}\\,${rightTex}`;
    }
    default:
      return '';
  }
}

/**
 * The display form of one calculator expression, or null when the calculator cannot parse it.
 *
 * The live line uses this for every valid expression; the tape uses it for every kept one. An
 * invalid or empty line returns null, which is the caller's cue to show the plain input alone.
 */
export function typesetExpression(input: string): string | null {
  try {
    return texNode(parseExpression(input));
  } catch {
    return null;
  }
}

/**
 * The complete visual vocabulary, as data. Each entry is a real calculator input, so the guide and
 * the test render exactly what a learner can type rather than a hand-written TeX sample that could
 * drift from the parser.
 */
export const TYPESET_SHOWCASE = [
  { id: 'fraction', label: 'Fractions', input: '1/2' },
  { id: 'power', label: 'Powers', input: '2^10' },
  { id: 'root', label: 'Roots', input: 'sqrt(2)' },
  { id: 'nthroot', label: 'Any root', input: 'nthroot(3, 8)' },
  { id: 'function', label: 'Functions', input: 'sin(pi/4)' },
  { id: 'log', label: 'Log bases', input: 'logb(2, 8)' },
  { id: 'factorial', label: 'Factorial', input: '5!' },
  { id: 'percent', label: 'Percent', input: '50%' },
  { id: 'combinatorics', label: 'nCr / nPr', input: 'nCr(5, 2)' },
  { id: 'absolute', label: 'Absolute value', input: 'abs(-7)' },
  { id: 'floor', label: 'Floor / ceiling', input: 'floor(2.9)' },
  { id: 'implicit', label: 'Implicit ×', input: '2pi' },
] as const;

export type TypesetShowcase = (typeof TYPESET_SHOWCASE)[number];
